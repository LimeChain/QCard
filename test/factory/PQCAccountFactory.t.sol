// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import "forge-std/Test.sol";
import "../../src/factory/PQCAccountFactory.sol";
import "../../src/lamport/LamportVerifier.sol";
import "../../src/lamport/LamportAccount.sol";
import "../../src/falcon/FalconAccount.sol";
import {ISigVerifier} from "InterfaceVerifier/IVerifier.sol";

contract MockVerifier is ISigVerifier {
    function setKey(bytes calldata) external pure returns (bytes memory) {
        return abi.encodePacked(address(0x1234));
    }

    function verify(bytes calldata, bytes32, bytes calldata) external pure returns (bytes4) {
        return ISigVerifier.verify.selector;
    }
}

contract PQCAccountFactoryTest is Test {
    PQCAccountFactory public factory;
    LamportVerifier public lamportVerifier;
    MockVerifier public falconVerifier;

    address internal constant ENTRY_POINT = address(0x4337);
    address internal constant OWNER = address(0xBEEF);

    function setUp() public {
        lamportVerifier = new LamportVerifier();
        falconVerifier = new MockVerifier();
        factory = new PQCAccountFactory(address(lamportVerifier), address(falconVerifier), ENTRY_POINT);
    }

    function test_CreateLamportAccount() public {
        bytes32 root = keccak256("test-root");

        LamportAccount account = factory.createLamportAccount(root, OWNER, 0);

        assertTrue(address(account) != address(0), "Account should be deployed");
        assertEq(account.owner(), OWNER, "Owner should match");
        assertEq(account.publicKeyRoot(), root, "Public key root should match");
        assertEq(account.entryPoint(), ENTRY_POINT, "EntryPoint should match");
    }

    function test_CreateFalconAccount() public {
        bytes memory pubKey = hex"DEADBEEFCAFEBABE";

        FalconAccount account = factory.createFalconAccount(pubKey, OWNER, 0);

        assertTrue(address(account) != address(0), "Account should be deployed");
        assertEq(account.owner(), OWNER, "Owner should match");
        assertEq(account.entryPoint(), ENTRY_POINT, "EntryPoint should match");
    }

    function test_DeterministicAddress() public {
        bytes32 root = keccak256("deterministic-test");
        uint256 salt = 42;

        address predicted = factory.getLamportAccountAddress(root, OWNER, salt);
        LamportAccount account = factory.createLamportAccount(root, OWNER, salt);

        assertEq(address(account), predicted, "Deployed address should match prediction");
    }

    function test_DifferentSaltsDifferentAddresses() public {
        bytes32 root = keccak256("salt-test");

        LamportAccount a1 = factory.createLamportAccount(root, OWNER, 1);
        LamportAccount a2 = factory.createLamportAccount(root, OWNER, 2);

        assertTrue(address(a1) != address(a2), "Different salts should produce different addresses");
    }

    function test_AccountReceivesETH() public {
        bytes32 root = keccak256("eth-test");
        LamportAccount account = factory.createLamportAccount(root, OWNER, 0);

        vm.deal(address(account), 5 ether);
        assertEq(address(account).balance, 5 ether, "Account should hold ETH");
    }
}
