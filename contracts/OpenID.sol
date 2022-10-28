// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "./modules/commons/ModuleAdminAuth.sol";
import "./utils/LibRsa.sol";
import "./utils/LibBytes.sol";
import "./utils/LibBase64.sol";

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

import "hardhat/console.sol";

contract OpenID is Initializable, ModuleAdminAuth, UUPSUpgradeable {
    using LibBytes for bytes;

    event UpdateOpenIDPublicKey(bytes32 _key, bytes _publicKey);
    event DeleteOpenIdPublicKey(bytes32 _key);

    enum OpenIDParamsIndex {
        issLeftIndex,
        issRightIndex,
        kidLeftIndex,
        kidRightIndex,
        iatLeftIndex,
        expLeftIndex
    }
    uint256 constant OpenIDParamsIndexNum = 6;

    /**
     * openIDPublicKey: kecaak256(issuser + key id) => public key
     */
    mapping(bytes32 => bytes) openIDPublicKey;

    constructor(address _admin) ModuleAdminAuth(_admin) {
        _disableInitializers();
    }

    function initialize() public initializer {
        openIDPublicKey[
            keccak256(abi.encodePacked("https://accounts.google.com", "ee1b9f88cfe3151ddd284a61bf8cecf659b130cf"))
        ] = hex"ad33b155009d3cc33a9f75d15bb556e5ef1b182a229b14fe9b8714c9a4ed2c221fd48a85251873737ae0771b1da60e5f8e3d4b9f6c86febfb715b905609c3579b382c09ff196b21e2fb1595aa287976bb9b4f2a16240693ec87e48566b944bfa5fa5b6b4b717685b3ff2a7876c46ac5b703b4ba4a24babcc2ef70482e7ef1d21ccd56eb553a47dc333a8d25af7ac104e6a1645af65729bc3f779967dbbf8b4ed1144a941058475e71d81cc2d8d8287df896d99424556c139f4f108f74ea8e919c8541f18e323e572db3c75cb481966b0dcc54afdca80f85982f99f2b5d775543774458270d9e6affee052bcda3fcbd05ad86543d118103d0ab96fb7183f2c959";

        openIDPublicKey[
            keccak256(abi.encodePacked("https://accounts.google.com", "77cc0ef4c7181cf4c0dcef7b60ae28cc9022c76b"))
        ] = hex"c8247565af478e94f8f46ca64509584ac360f33ecf646161e5adba21a0a8f3ac4fb8071fe95ba6aca606e9a2bd635061f6a27d301575a1a8e66ad4ee5ed73e16dab0a87f49cdb6fffa60981b2971d3c32aafcdf2755fdf21aeb88a5a55941cff2c70de0ca21835ea502c6aa530d43a895b8cf4c5fd35eb0ddffb70b9daa0cff2e5dc5664a62d03b15388c15f9f38fdf31fa87f7b460f6c822321cc4252cdcf7b4ae472351545fdf20df3d04e368db5487d420e831888b5c5ee435347a02ef42fe8275b477c0cc4d0e9f2e9e1168ac269e9e50fcba5cc1fed653d1fb7abb13ce1c4c76f45a47ea6cdf22c6dc4d9ed56817f0e8a61468fb1938272ca58d787b1a3";

        __UUPSUpgradeable_init();
    }

    function getOpenIDPublicKey(bytes32 _key) public view returns (bytes memory publicKey) {
        publicKey = openIDPublicKey[_key];
    }

    function updateOpenIDPublidKey(bytes32 _key, bytes calldata _publicKey) external onlyAdmin {
        openIDPublicKey[_key] = _publicKey;
        emit UpdateOpenIDPublicKey(_key, _publicKey);
    }

    function deleteOpenIDPublicKey(bytes32 _key) external onlyAdmin {
        delete openIDPublicKey[_key];
        emit DeleteOpenIdPublicKey(_key);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyAdmin {}

    function _getOpenIDPublicKeyFromParams(
        uint256 _index,
        bytes calldata _data,
        bytes calldata _payload,
        bytes calldata _header
    ) internal view returns (bytes memory publicKey) {
        bytes calldata iss;
        {
            uint32 issLeftIndex;
            (issLeftIndex, ) = _data.cReadUint32(uint256(OpenIDParamsIndex.issLeftIndex) * 4 + _index);
            uint32 issRightIndex;
            (issRightIndex, ) = _data.cReadUint32(uint256(OpenIDParamsIndex.issRightIndex) * 4 + _index);

            // As Iss will be verified by rsa in the header, there is no need to check iss
            iss = _payload[issLeftIndex:issRightIndex];
        }

        bytes calldata kid;
        {
            uint32 kidLeftIndex;
            (kidLeftIndex, ) = _data.cReadUint32(uint256(OpenIDParamsIndex.kidLeftIndex) * 4 + _index);
            uint32 kidRightIndex;
            (kidRightIndex, ) = _data.cReadUint32(uint256(OpenIDParamsIndex.kidRightIndex) * 4 + _index);

            // As Kid will be verified by rsa in the header, there is no need to check kid
            kid = _header[kidLeftIndex:kidRightIndex];
        }

        publicKey = getOpenIDPublicKey(keccak256(abi.encodePacked(iss, kid)));
    }

    function _validateTimestamp(
        uint256 _index,
        bytes calldata _data,
        bytes calldata _payload
    ) internal view {
        bytes calldata iat;
        {
            uint32 iatLeftIndex;
            (iatLeftIndex, ) = _data.cReadUint32(uint256(OpenIDParamsIndex.iatLeftIndex) * 4 + _index);

            require(bytes32(_payload[iatLeftIndex - 6:iatLeftIndex]) == bytes32('"iat":'), "validateIDToken: INVALID_IAT");
            iat = _payload[iatLeftIndex:iatLeftIndex + 10];
        }

        bytes calldata exp;
        {
            uint32 expLeftIndex;
            (expLeftIndex, ) = _data.cReadUint32(uint256(OpenIDParamsIndex.expLeftIndex) * 4 + _index);

            require(bytes32(_payload[expLeftIndex - 6:expLeftIndex]) == bytes32('"exp":'), "validateIDToken: INVALID_EXP");
            exp = _payload[expLeftIndex:expLeftIndex + 10];
        }

        bytes32 timestamp = LibBytes.uint32ToASSCIIBytes32(uint32(block.timestamp));
        require(timestamp > bytes32(iat) && timestamp < bytes32(exp), "_validateTimestamp: INVALID_TIMESTAMP");
    }

    function validateIDToken(uint256 _index, bytes calldata _data) external view returns (bool succ) {
        bytes calldata header;
        bytes calldata payload;
        bytes calldata signature;
        {
            uint256 index = OpenIDParamsIndexNum * 4 + _index;
            uint32 len;
            (len, index) = _data.cReadUint32(index);
            header = _data[index:index + len];
            index += len;
            (len, index) = _data.cReadUint32(index);
            payload = _data[index:index + len];
            index += len;
            (len, index) = _data.cReadUint32(index);
            signature = _data[index:index + len];
        }

        bytes memory publicKey = _getOpenIDPublicKeyFromParams(_index, _data, payload, header);
        require(publicKey.length > 0, "validateIDToken: INVALID_PUB_KEY");

        _validateTimestamp(_index, _data, payload);

        // FIXME
        // Should encode with Base64Url
        // Not allow `?` or `\` in the header and payload
        bytes memory message = abi.encodePacked(LibBase64.urlEncode(header), ".", LibBase64.urlEncode(payload));

        succ = LibRsa.rsapkcs1Verify(sha256(message), publicKey, hex"010001", signature);
    }
}
