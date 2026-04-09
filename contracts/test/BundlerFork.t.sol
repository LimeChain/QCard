// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Test, console} from "forge-std/Test.sol";
import {HCAAccount} from "../src/HCAAccount.sol";
import {HCAFactory} from "../src/HCAFactory.sol";
import {LamportVerifier} from "../src/verifiers/LamportVerifier.sol";
import {ECDSAVerifier} from "../src/verifiers/ECDSAVerifier.sol";
import {FalconVerifier} from "../src/verifiers/FalconVerifier.sol";
import {UserOperation} from "../src/interfaces/IAccount.sol";

/// @dev Minimal v0.6 EntryPoint interface so we can call handleOps() on
///      the canonical deployed instance and reproduce what a bundler does.
interface IEntryPoint {
    function handleOps(UserOperation[] calldata ops, address payable beneficiary) external;
    function balanceOf(address account) external view returns (uint256);
    function getUserOpHash(UserOperation calldata userOp) external view returns (bytes32);
    function depositTo(address account) external payable;
    /// @dev Reverts with ValidationResult — bundlers decode the revert payload.
    function simulateValidation(UserOperation calldata userOp) external;
}

/// @notice Fork test that simulates the EXACT bundler flow against the real
///         ERC-4337 EntryPoint on Sepolia. Every AA21/AA23 failure we see
///         on the deployed Pimlico bundler should reproduce here first —
///         this is our debugging loop so we don't have to burn real ETH.
///
/// Run with:
///   forge test --fork-url $SEPOLIA_RPC_URL --match-contract BundlerForkTest -vvv --via-ir
contract BundlerForkTest is Test {
    IEntryPoint constant ENTRY_POINT = IEntryPoint(0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789);
    address constant FALCON_ENGINE = 0x01880eb770be007aE75febabA21532Fb5c33318B;

    // Actors
    address owner = address(0xBEEF);
    address bundler = address(0xB0B);
    address recipient = address(0xCAFE);

    // Deployed contracts (per-test)
    LamportVerifier lamportVerifier;
    ECDSAVerifier ecdsaVerifier;
    FalconVerifier falconVerifier;
    HCAFactory factory;
    HCAAccount account;

    // Per-test Lamport key material (leaf 0)
    bytes32 constant MASTER_SEED = keccak256("bundler-fork-seed");
    bytes32[512] pubKeyHashes;
    bytes32[512] privateKeys;
    bytes32 leaf0Hash;
    bytes32 leaf1Hash;
    bytes32 authRoot;

    function setUp() public {
        // Skip if SEPOLIA_RPC_URL isn't set (so normal forge test still passes)
        string memory rpc = vm.envOr("SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            return;
        }
        vm.createSelectFork(rpc);

        // Deploy fresh contracts on the fork
        lamportVerifier = new LamportVerifier();
        ecdsaVerifier = new ECDSAVerifier();
        falconVerifier = new FalconVerifier(FALCON_ENGINE);
        factory = new HCAFactory(
            address(lamportVerifier),
            address(falconVerifier),
            address(ecdsaVerifier),
            address(ENTRY_POINT)
        );

        // Build a Lamport leaf 0
        bytes32 leafSeed = keccak256(abi.encodePacked(MASTER_SEED, uint256(0)));
        for (uint256 i = 0; i < 512; i++) {
            privateKeys[i] = keccak256(abi.encodePacked(leafSeed, i));
            pubKeyHashes[i] = keccak256(abi.encodePacked(privateKeys[i]));
        }
        bytes memory commitment = abi.encode(pubKeyHashes);
        leaf0Hash = keccak256(abi.encodePacked(uint8(0x01), keccak256(commitment)));
        // Dummy sibling leaf
        leaf1Hash = keccak256("dummy-sibling");
        authRoot = keccak256(abi.encodePacked(leaf0Hash, leaf1Hash));

        // Deploy the HCA account via the factory (matches what the UI does)
        account = factory.createAccount(authRoot, owner, block.timestamp);
    }

    /// @notice Reproduce the AA21 / "didn't pay prefund" scenario end-to-end.
    ///         Funds the account with 0.3 ETH, builds a real userOp with a
    ///         Lamport leaf-0 signature, and calls handleOps as a bundler.
    function test_BundlerFlow_Lamport_Succeeds() public {
        string memory rpc = vm.envOr("SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            console.log("SEPOLIA_RPC_URL not set - skipping fork test");
            return;
        }

        // Fund the HCA account exactly as the wizard does (plain ETH transfer)
        vm.deal(address(account), 0.3 ether);

        // Build the userOp with the SAME values the frontend uses:
        //   callGasLimit         = 500_000
        //   verificationGasLimit = 3_000_000
        //   preVerificationGas   = 100_000
        //   maxFeePerGas         = 10 gwei (slightly above Pimlico standard)
        //   maxPriorityFeePerGas = 1 gwei
        //   callData             = execute(recipient, 0.001 ether, "")
        bytes memory callData = abi.encodeWithSelector(
            HCAAccount.execute.selector,
            recipient,
            uint256(0.001 ether),
            bytes("")
        );

        UserOperation memory op = UserOperation({
            sender: address(account),
            nonce: 0,
            initCode: "",
            callData: callData,
            callGasLimit: 500_000,
            verificationGasLimit: 3_000_000,
            preVerificationGas: 100_000,
            maxFeePerGas: 10 gwei,
            maxPriorityFeePerGas: 1 gwei,
            paymasterAndData: "",
            signature: ""
        });

        // Ask the real EntryPoint what userOpHash this UserOp produces.
        // Matches what Pimlico computes server-side.
        bytes32 userOpHash = ENTRY_POINT.getUserOpHash(op);
        console.log("userOpHash:");
        console.logBytes32(userOpHash);

        // Sign Lamport: reveal privateKeys[2i + bit(i)] for each of 256 bits
        bytes32[256] memory sig;
        for (uint256 i = 0; i < 256; i++) {
            uint256 bit = (uint256(userOpHash) >> (255 - i)) & 1;
            sig[i] = privateKeys[2 * i + bit];
        }

        // sigData = abi.encode(bytes32[512], bytes32[256])
        bytes memory sigData = abi.encode(pubKeyHashes, sig);
        // commitment = abi.encode(bytes32[512])
        bytes memory commitment = abi.encode(pubKeyHashes);
        // Merkle proof for leaf 0 in a 2-leaf tree
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = leaf1Hash;

        // Full 5-field signature
        op.signature = abi.encode(uint8(0x01), uint256(0), proof, commitment, sigData);

        // Record balances before
        uint256 accountBalBefore = address(account).balance;
        uint256 epDepositBefore = ENTRY_POINT.balanceOf(address(account));
        uint256 recipientBefore = recipient.balance;
        console.log("Account balance before: ", accountBalBefore);
        console.log("EP deposit before:      ", epDepositBefore);

        // Call handleOps from the bundler address
        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = op;

        vm.prank(bundler);
        ENTRY_POINT.handleOps(ops, payable(bundler));

        // Verify the tx actually happened
        uint256 recipientAfter = recipient.balance;
        console.log("Recipient after:", recipientAfter);
        assertEq(recipientAfter - recipientBefore, 0.001 ether, "recipient should receive the transfer");

        // Verify the account paid the prefund via its EntryPoint deposit
        uint256 accountBalAfter = address(account).balance;
        console.log("Account balance after:  ", accountBalAfter);
        assertLt(accountBalAfter, accountBalBefore, "account should have paid gas");
    }

    /// @notice Reproduce against the LIVE deployed HCAAccount the user hit AA21 on.
    ///         If this reverts here it's reproducible; if it passes, the problem
    ///         is only in Pimlico's simulation context.
    function test_LiveAccount_SimulateValidation() public {
        string memory rpc = vm.envOr("SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;

        // User's current HCA account from wizard state (0.3 ETH funded)
        address liveAccount = 0x86Ec773fDE440aA4Fd02402C77DEbDE13888DF51;

        uint256 balance = liveAccount.balance;
        uint256 deposit = ENTRY_POINT.balanceOf(liveAccount);
        console.log("Live account balance:", balance);
        console.log("Live EP deposit:     ", deposit);

        // Build a junk-signature userOp at the same gas settings the frontend uses
        bytes memory callData = abi.encodeWithSelector(
            HCAAccount.execute.selector,
            recipient,
            uint256(0.001 ether),
            bytes("")
        );

        UserOperation memory op = UserOperation({
            sender: liveAccount,
            nonce: HCAAccount(payable(liveAccount)).nonce(),
            initCode: "",
            callData: callData,
            callGasLimit: 500_000,
            verificationGasLimit: 3_000_000,
            preVerificationGas: 100_000,
            maxFeePerGas: 10 gwei,
            maxPriorityFeePerGas: 1 gwei,
            paymasterAndData: "",
            signature: abi.encode(uint8(0x01), uint256(0), new bytes32[](0), bytes(""), bytes(""))
        });

        // simulateValidation ALWAYS reverts — we just want to catch the revert reason
        try ENTRY_POINT.simulateValidation(op) {
            console.log("simulateValidation did not revert?");
        } catch Error(string memory reason) {
            console.log("Revert reason:", reason);
            // If AA21 — deposit wasn't paid during validateUserOp
            // If AA23 — our validateUserOp itself reverted (likely sig check)
            // ValidationResult is expected-success (bundlers decode from revert)
        } catch (bytes memory returnData) {
            // ValidationResult sends data via revert — first 4 bytes are selector
            bytes4 selector;
            assembly { selector := mload(add(returnData, 0x20)) }
            console.log("Revert selector:");
            console.logBytes4(selector);
            // ValidationResult selector = 0xe0cff05f
            if (selector == 0xe0cff05f) {
                console.log("SUCCESS: simulateValidation returned ValidationResult");
            } else {
                console.log("Unexpected revert selector - probably AA21 or AA23");
                console.logBytes(returnData);
            }
        }
    }
}
