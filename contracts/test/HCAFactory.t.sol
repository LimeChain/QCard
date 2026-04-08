// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Test} from "forge-std/Test.sol";
import {HCAFactory} from "../src/HCAFactory.sol";
import {HCAAccount} from "../src/HCAAccount.sol";
import {LamportVerifier} from "../src/verifiers/LamportVerifier.sol";
import {ECDSAVerifier} from "../src/verifiers/ECDSAVerifier.sol";

contract HCAFactoryTest is Test {
    HCAFactory public factory;
    LamportVerifier public lamport;
    ECDSAVerifier public ecdsa;

    address constant ENTRY_POINT = address(0xEE);
    address constant OWNER = address(0xBEEF);

    function setUp() public {
        lamport = new LamportVerifier();
        ecdsa = new ECDSAVerifier();

        // address(0) for Falcon since we skip it in tests
        factory = new HCAFactory(
            address(lamport),
            address(0),
            address(ecdsa),
            ENTRY_POINT
        );
    }

    function test_CreateAccount() public {
        bytes32 authRoot = keccak256("test-auth-root");
        uint256 salt = 42;

        HCAAccount account = factory.createAccount(authRoot, OWNER, salt);

        assertEq(account.authRoot(), authRoot);
        assertEq(account.owner(), OWNER);
        assertEq(account.ENTRY_POINT(), ENTRY_POINT);
        assertEq(account.nonce(), 0);
        assertEq(account.verifiers(0x01), address(lamport));
        assertEq(account.verifiers(0x02), address(0));
        assertEq(account.verifiers(0x03), address(ecdsa));
    }

    function test_DeterministicAddress() public {
        bytes32 authRoot = keccak256("deterministic-root");
        uint256 salt = 123;

        address predicted = factory.getAccountAddress(authRoot, OWNER, salt);
        HCAAccount actual = factory.createAccount(authRoot, OWNER, salt);

        assertEq(address(actual), predicted, "CREATE2 address should be deterministic");
    }

    function test_DifferentSalts_DifferentAddresses() public {
        bytes32 authRoot = keccak256("same-root");

        address addr1 = factory.getAccountAddress(authRoot, OWNER, 1);
        address addr2 = factory.getAccountAddress(authRoot, OWNER, 2);

        assertTrue(addr1 != addr2, "Different salts should produce different addresses");
    }

    function test_DifferentOwners_DifferentAddresses() public {
        bytes32 authRoot = keccak256("same-root");
        uint256 salt = 1;

        address addr1 = factory.getAccountAddress(authRoot, OWNER, salt);
        address addr2 = factory.getAccountAddress(authRoot, address(0xDEAD), salt);

        assertTrue(addr1 != addr2, "Different owners should produce different addresses");
    }

    function test_DifferentRoots_DifferentAddresses() public {
        uint256 salt = 1;

        address addr1 = factory.getAccountAddress(keccak256("root-a"), OWNER, salt);
        address addr2 = factory.getAccountAddress(keccak256("root-b"), OWNER, salt);

        assertTrue(addr1 != addr2, "Different auth roots should produce different addresses");
    }
}
