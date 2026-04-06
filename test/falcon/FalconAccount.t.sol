// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import "forge-std/Test.sol";
import "../../src/falcon/FalconAccount.sol";
import "../../src/interfaces/IAccount.sol";
import {ISigVerifier} from "InterfaceVerifier/IVerifier.sol";

contract MockFalconVerifier is ISigVerifier {
    bool public shouldPass = true;

    function setShouldPass(bool _pass) external {
        shouldPass = _pass;
    }

    function setKey(bytes calldata) external pure returns (bytes memory) {
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

    address internal constant OWNER = address(0xBEEF);

    function setUp() public {
        mockVerifier = new MockFalconVerifier();
        account = new FalconAccount(address(mockVerifier), hex"DEADBEEF", address(this), OWNER);
        vm.deal(address(account), 10 ether);
    }

    function test_ValidateUserOp_ValidSignature() public {
        UserOperation memory userOp = _buildUserOp(hex"CAFEBABE", 0);
        bytes32 userOpHash = keccak256("test-falcon-op");

        uint256 result = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, 0, "Valid signature should return 0");
        assertEq(account.nonce(), 1, "Nonce should increment");
    }

    function test_ValidateUserOp_InvalidSignature() public {
        UserOperation memory userOp = _buildUserOp(hex"CAFEBABE", 0);
        bytes32 userOpHash = keccak256("test-falcon-op");

        mockVerifier.setShouldPass(false);

        uint256 result = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, 1, "Invalid signature should return SIG_VALIDATION_FAILED");
        assertEq(account.nonce(), 0, "Nonce should NOT increment");
    }

    function test_ValidateUserOp_RejectsReplay() public {
        UserOperation memory userOp = _buildUserOp(hex"CAFEBABE", 0);
        bytes32 userOpHash = keccak256("test-falcon-op");
        uint256 balanceBefore = address(this).balance;

        uint256 firstResult = account.validateUserOp(userOp, userOpHash, 0.1 ether);
        uint256 secondResult = account.validateUserOp(userOp, userOpHash, 0.1 ether);

        assertEq(firstResult, 0, "First validation should pass");
        assertEq(secondResult, 1, "Replay should fail once nonce advances");
        assertEq(account.nonce(), 1, "Nonce should only increment once");
        assertEq(address(this).balance - balanceBefore, 0.1 ether, "EntryPoint should only receive one prefund payment");
    }

    function test_ValidateUserOp_RejectsWrongNonce() public {
        UserOperation memory userOp = _buildUserOp(hex"CAFEBABE", 9);
        bytes32 userOpHash = keccak256("test-falcon-op");

        uint256 result = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(result, 1, "Wrong nonce should fail");
    }

    function test_ValidateUserOp_RevertsForNonEntryPoint() public {
        UserOperation memory userOp = _buildUserOp(hex"CAFEBABE", 0);
        bytes32 userOpHash = keccak256("test-falcon-op");

        vm.prank(address(0xCAFE));
        vm.expectRevert(FalconAccount.OnlyEntryPoint.selector);
        account.validateUserOp(userOp, userOpHash, 0);
    }

    function test_Execute_AsOwner() public {
        vm.prank(OWNER);
        account.execute(address(0xCAFE), 1 ether, "");
        assertEq(address(0xCAFE).balance, 1 ether);
    }

    function test_Execute_AsEntryPoint() public {
        account.execute(address(0xCAFE), 1 ether, "");
        assertEq(address(0xCAFE).balance, 1 ether);
    }

    function test_UpdatePublicKey_OnlyOwner() public {
        vm.prank(OWNER);
        account.updatePublicKey(hex"AABBCCDD");

        vm.prank(address(0xDEAD));
        vm.expectRevert(FalconAccount.OnlyOwner.selector);
        account.updatePublicKey(hex"EEEE");
    }

    function test_PublicKeyStored() public view {
        bytes memory stored = account.storedPubKeyPointer();
        assertTrue(stored.length > 0, "Public key pointer should be stored");
    }

    function test_ValidatePaysFunds() public {
        UserOperation memory userOp = _buildUserOp(hex"CAFEBABE", 0);
        bytes32 userOpHash = keccak256("pay-test");

        uint256 balBefore = address(this).balance;
        account.validateUserOp(userOp, userOpHash, 0.1 ether);
        assertEq(address(this).balance - balBefore, 0.1 ether, "Should pay missingAccountFunds");
    }

    function _buildUserOp(bytes memory sig, uint256 userNonce) internal view returns (UserOperation memory) {
        return UserOperation({
            sender: address(account),
            nonce: userNonce,
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
