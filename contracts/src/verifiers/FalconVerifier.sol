// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {ISchemeVerifier} from "./ISchemeVerifier.sol";

/// @dev Minimal interface to ZKNox ETHFALCON engine (4-parameter verify overload).
///      Expects the public key in NTT-compacted form, signature as (salt, s2).
interface IEthFalconEngine {
    function verify(
        bytes memory h,
        bytes memory salt,
        uint256[] memory s2,
        uint256[] memory ntth
    ) external pure returns (bool);
}

/// @title FalconVerifier -- HCA dispatch wrapper around ZKNox ETHFALCON
/// @notice Uses the direct 4-parameter verify() overload that takes the
///         NTT-compacted public key inline, avoiding the SSTORE2 pointer dance.
///
/// sigData layout: abi.encode(bytes salt, uint256[] s2Compact, uint256[] pkCompact)
///   - salt:      40 bytes, extracted from the raw Falcon signature
///   - s2Compact: uint256[32], decompressed s2 polynomial compacted (16 coeffs / word)
///   - pkCompact: uint256[32], public key after NTT + compaction
///
/// The HCA leaf commitment for a Falcon leaf is abi.encode(uint256[] pkCompact),
/// so the Merkle-verified public key matches what the engine receives.
contract FalconVerifier is ISchemeVerifier {
    IEthFalconEngine public immutable FALCON_ENGINE;

    constructor(address _falconEngine) {
        FALCON_ENGINE = IEthFalconEngine(_falconEngine);
    }

    /// @inheritdoc ISchemeVerifier
    function verify(bytes32 msgHash, bytes calldata sigData) external view override returns (bool) {
        (bytes memory salt, uint256[] memory s2, uint256[] memory ntth) =
            abi.decode(sigData, (bytes, uint256[], uint256[]));

        bytes memory h = abi.encodePacked(msgHash);
        return FALCON_ENGINE.verify(h, salt, s2, ntth);
    }
}
