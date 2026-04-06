// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import "../../src/falcon/FalconAccount.sol";
import "../../src/interfaces/IAccount.sol";
import {ISigVerifier} from "InterfaceVerifier/IVerifier.sol";

/// @notice Mock Falcon verifier for unit testing the account contract plumbing.
///         Real Falcon verification tests require off-chain signature generation (Python signer).
///         This mock lets us test the account logic independently.
contract MockFalconVerifier is ISigVerifier {
    // Predefined "valid" signature for testing
    bytes32 public validHash;
    bytes public validSignature;
    bool public shouldPass;

    constructor() {
        shouldPass = true;
    }

    function setValidSignature(bytes32 _hash, bytes memory _sig) external {
        validHash = _hash;
        validSignature = _sig;
    }

    function setShouldPass(bool _pass) external {
        shouldPass = _pass;
    }

    function setKey(bytes calldata) external pure returns (bytes memory) {
        // Return a fake SSTORE2 pointer (20 bytes)
        return abi.encodePacked(address(0x1234567890123456789012345678901234567890));
    }

    function verify(bytes calldata, bytes32, bytes calldata)
        external
        view
        returns (bytes4)
    {
        if (shouldPass) {
            return ISigVerifier.verify.selector;
        }
        return 0xFFFFFFFF;
    }
}

contract FalconAccountTest is Test {
    MockFalconVerifier public mockVerifier;
    FalconAccount public account;
    address constant OWNER = address(0xBEEF);

    function setUp() public {
        mockVerifier = new MockFalconVerifier();

        // Deploy account with mock verifier and a dummy public key
        bytes memory dummyPubKey = hex"DEADBEEF";
        account = new FalconAccount(address(mockVerifier), dummyPubKey, OWNER);
        vm.deal(address(account), 10 ether);
    }

    function test_ValidateUserOp_ValidSignature() public {
        UserOperation memory userOp = _buildUserOp(hex"CAFEBABE");
        bytes32 userOpHash = keccak256("test-falcon-op");

        mockVerifier.setShouldPass(true);

        uint256 result = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, 0, "Valid signature should return 0");
        assertEq(account.nonce(), 1, "Nonce should increment");
    }

    function test_ValidateUserOp_InvalidSignature() public {
        UserOperation memory userOp = _buildUserOp(hex"CAFEBABE");
        bytes32 userOpHash = keccak256("test-falcon-op");

        mockVerifier.setShouldPass(false);

        uint256 result = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, 1, "Invalid signature should return SIG_VALIDATION_FAILED");
        assertEq(account.nonce(), 0, "Nonce should NOT increment");
    }

    function test_Execute() public {
        address recipient = address(0xCAFE);
        vm.prank(OWNER);
        account.execute(recipient, 1 ether, "");
        assertEq(recipient.balance, 1 ether);
    }

    function test_UpdatePublicKey_OnlyOwner() public {
        vm.prank(OWNER);
        account.updatePublicKey(hex"AABBCCDD");
        // Should not revert

        vm.prank(address(0xDEAD));
        vm.expectRevert(FalconAccount.OnlyOwner.selector);
        account.updatePublicKey(hex"EEEE");
    }

    function test_PublicKeyStored() public view {
        bytes memory stored = account.storedPubKeyPointer();
        assertTrue(stored.length > 0, "Public key pointer should be stored");
    }

    function test_ValidatePaysFunds() public {
        UserOperation memory userOp = _buildUserOp(hex"CAFEBABE");
        bytes32 userOpHash = keccak256("pay-test");
        mockVerifier.setShouldPass(true);

        address entryPoint = address(this);
        uint256 balBefore = entryPoint.balance;

        account.validateUserOp(userOp, userOpHash, 0.1 ether);

        assertEq(entryPoint.balance - balBefore, 0.1 ether, "Should pay missingAccountFunds");
    }

    // --- Helpers ---

    function _buildUserOp(bytes memory sig) internal view returns (UserOperation memory) {
        return UserOperation({
            sender: address(account),
            nonce: 0,
            callData: "",
            callGasLimit: 100000,
            verificationGasLimit: 5000000,
            preVerificationGas: 50000,
            maxFeePerGas: 1 gwei,
            maxPriorityFeePerGas: 1 gwei,
            signature: sig
        });
    }

    receive() external payable {}
}
