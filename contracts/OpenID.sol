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
    event AddOpenIDAudience(bytes32 _key);
    event DeleteOpenIDAudience(bytes32 _key);

    enum OpenIDParamsIndex {
        issLeftIndex,
        issRightIndex,
        kidLeftIndex,
        kidRightIndex,
        subLeftIndex,
        subRightIndex,
        audLeftIndex,
        audRightIndex,
        nonceLeftIndex,
        iatLeftIndex,
        expLeftIndex
    }
    uint256 constant OpenIDParamsIndexNum = 11;

    /**
     * openIDPublicKey: kecaak256(issuser + key id) => public key
     */
    mapping(bytes32 => bytes) openIDPublicKey;

    /**
     * openIDAudience: keccak256(issuser + audiance) => is valid
     */
    mapping(bytes32 => bool) openIDAudience;

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

        openIDPublicKey[
            keccak256(
                abi.encodePacked(
                    "https:\\/\\/cognito-idp.us-east-1.amazonaws.com\\/us-east-1_37CBi928o",
                    "kRPZ1hNWuJm+hLZF7FdcVBGflXCB4uDdmWAe8H7ad2g="
                )
            )
        ] = hex"d74ee879c2948502878b5c12054b51bd3fdde0afeef878428e3a8de2ac71910b9b73bde05ac88df71499c36ad6bde17881765414cc9d68d1c42ade78a730bd5e734578ad4a72e02582e0344227553e5a22e743092e99cd8af728ac5f8957a8fed352f24bda2e38197cec39ee8d843f49be4b84958068d51d59da35f20a0ab91f23b6b7a4aa556e1deb19b5283720fc42f7b08ca78f7d51cef4a1a097b1c94f2a1e347b805935767f83b605528373e4b44a407ba27ea5fbd6322ae1f0634189241db40c617fc7aa9b524315fa2b057e996e2848c56a2ad88c7d94296609ee8de0c0e77c2ed3e3a864e3f91a86fdb6149c2db7740b9ce8c641e237a768dd44a8a9";

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

    function isAudienceValid(bytes32 _key) public view returns (bool isValid) {
        isValid = openIDAudience[_key];
    }

    function addOpenIDAudience(bytes32 _key) external onlyAdmin {
        openIDAudience[_key] = true;
        emit AddOpenIDAudience(_key);
    }

    function deleteOpenIDAudience(bytes32 _key) external onlyAdmin {
        delete openIDAudience[_key];
        emit DeleteOpenIDAudience(_key);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyAdmin {}

    function _validateTimestamp(
        uint256 _index,
        bytes calldata _data,
        bytes calldata _payload
    ) private view {
        bytes calldata iat;
        {
            uint32 iatLeftIndex;
            (iatLeftIndex, ) = _data.cReadUint32(uint256(OpenIDParamsIndex.iatLeftIndex) * 4 + _index);

            require(bytes32(_payload[iatLeftIndex - 6:iatLeftIndex]) == bytes32('"iat":'), "_validateTimestamp: INVALID_IAT");
            iat = _payload[iatLeftIndex:iatLeftIndex + 10];
        }

        bytes calldata exp;
        {
            uint32 expLeftIndex;
            (expLeftIndex, ) = _data.cReadUint32(uint256(OpenIDParamsIndex.expLeftIndex) * 4 + _index);

            require(bytes32(_payload[expLeftIndex - 6:expLeftIndex]) == bytes32('"exp":'), "_validateTimestamp: INVALID_EXP");
            exp = _payload[expLeftIndex:expLeftIndex + 10];
        }

        bytes32 timestamp = LibBytes.uint32ToASSCIIBytes32(uint32(block.timestamp));
        require(timestamp > bytes32(iat) && timestamp < bytes32(exp), "_validateTimestamp: INVALID_TIMESTAMP");
    }

    function validateAccessToken(uint256 _index, bytes calldata _data)
        external
        view
        returns (
            bool succ,
            uint256 index,
            bytes32 issHash,
            bytes32 subHash,
            bytes32 nonceHash
        )
    {
        bytes calldata header;
        bytes calldata payload;
        bytes calldata signature;
        {
            index = OpenIDParamsIndexNum * 4 + _index;
            uint32 len;
            (len, index) = _data.cReadUint32(index);
            header = _data[index:index + len];
            index += len;
            (len, index) = _data.cReadUint32(index);
            payload = _data[index:index + len];
            index += len;
            (len, index) = _data.cReadUint32(index);
            signature = _data[index:index + len];
            index += len;
        }

        bytes memory publicKey;
        (issHash, publicKey) = _getPublicKeyAndIssHash(_index, _data, header, payload);

        _validateTimestamp(_index, _data, payload);

        succ = LibRsa.rsapkcs1Verify(
            sha256(abi.encodePacked(LibBase64.urlEncode(header), ".", LibBase64.urlEncode(payload))),
            publicKey,
            hex"010001",
            signature
        );

        nonceHash = keccak256(_getNonce(_index, _data, payload));

        subHash = keccak256(_getSub(_index, _data, payload));
    }

    function _getNonce(
        uint256 _index,
        bytes calldata _data,
        bytes calldata _payload
    ) internal pure returns (bytes calldata nonce) {
        uint32 nonceLeftIndex;
        (nonceLeftIndex, ) = _data.cReadUint32(uint256(OpenIDParamsIndex.nonceLeftIndex) * 4 + _index);

        require(bytes32(_payload[nonceLeftIndex - 9:nonceLeftIndex]) == bytes32('"nonce":"'), "_getNonce: INVALID_NONCE");
        nonce = _payload[nonceLeftIndex:nonceLeftIndex + 66];
    }

    function _getSub(
        uint256 _index,
        bytes calldata _data,
        bytes calldata _payload
    ) internal pure returns (bytes calldata sub) {
        uint32 subLeftIndex;
        (subLeftIndex, ) = _data.cReadUint32(uint256(OpenIDParamsIndex.subLeftIndex) * 4 + _index);
        require(bytes7(_payload[subLeftIndex - 7:subLeftIndex]) == bytes7('"sub":"'), "_getSub: INVALID_SUB_LEFT");

        uint32 subRightIndex;
        (subRightIndex, ) = _data.cReadUint32(uint256(OpenIDParamsIndex.subRightIndex) * 4 + _index);
        bytes2 suffix = bytes2(_payload[subRightIndex:subRightIndex + 2]);
        require(suffix == bytes2('",') || suffix == bytes2('"}'), "_getSub: INVALID_SUB_RIGHT");

        sub = _payload[subLeftIndex:subRightIndex];
    }

    function _getPublicKeyAndIssHash(
        uint256 _index,
        bytes calldata _data,
        bytes calldata _header,
        bytes calldata _payload
    ) private view returns (bytes32 issHash, bytes memory publicKey) {
        bytes calldata iss = _getIss(_index, _data, _payload);
        issHash = keccak256(iss);

        bytes calldata aud = _getAud(_index, _data, _payload);
        require(isAudienceValid(keccak256(abi.encodePacked(iss, aud))), "_getPublicKeyAndIssHash: INVALID_AUD");

        bytes memory kid = _getKid(_index, _data, _header);
        publicKey = getOpenIDPublicKey(keccak256(abi.encodePacked(iss, kid)));
        require(publicKey.length > 0, "_getPublicKeyAndIssHash: INVALID_PUB_KEY");
    }

    function _getIss(
        uint256 _index,
        bytes calldata _data,
        bytes calldata _payload
    ) internal pure returns (bytes calldata iss) {
        uint32 issLeftIndex;
        (issLeftIndex, ) = _data.cReadUint32(uint256(OpenIDParamsIndex.issLeftIndex) * 4 + _index);
        require(bytes7(_payload[issLeftIndex - 7:issLeftIndex]) == bytes7('"iss":"'), "_getIss: INVALID_ISS_LEFT");

        uint32 issRightIndex;
        (issRightIndex, ) = _data.cReadUint32(uint256(OpenIDParamsIndex.issRightIndex) * 4 + _index);
        bytes2 suffix = bytes2(_payload[issRightIndex:issRightIndex + 2]);
        require(suffix == bytes2('",') || suffix == bytes2('"}'), "_getIss: INVALID_ISS_RIGHT");

        iss = _payload[issLeftIndex:issRightIndex];
    }

    function _getKid(
        uint256 _index,
        bytes calldata _data,
        bytes calldata _header
    ) internal pure returns (bytes calldata kid) {
        uint32 kidLeftIndex;
        (kidLeftIndex, ) = _data.cReadUint32(uint256(OpenIDParamsIndex.kidLeftIndex) * 4 + _index);
        require(bytes7(_header[kidLeftIndex - 7:kidLeftIndex]) == bytes7('"kid":"'), "_getKid: INVALID_KID_LEFT");

        uint32 kidRightIndex;
        (kidRightIndex, ) = _data.cReadUint32(uint256(OpenIDParamsIndex.kidRightIndex) * 4 + _index);
        bytes2 suffix = bytes2(_header[kidRightIndex:kidRightIndex + 2]);
        require(suffix == bytes2('",') || suffix == bytes2('"}'), "_getIss: INVALID_KID_RIGHT");

        kid = _header[kidLeftIndex:kidRightIndex];
    }

    function _getAud(
        uint256 _index,
        bytes calldata _data,
        bytes calldata _payload
    ) internal pure returns (bytes calldata aud) {
        uint32 audLeftIndex;
        (audLeftIndex, ) = _data.cReadUint32(uint256(OpenIDParamsIndex.audLeftIndex) * 4 + _index);
        require(bytes7(_payload[audLeftIndex - 7:audLeftIndex]) == bytes7('"aud":"'), "_getAud: INVALID_AUD_LEFT");

        uint32 audRightIndex;
        (audRightIndex, ) = _data.cReadUint32(uint256(OpenIDParamsIndex.audRightIndex) * 4 + _index);
        bytes2 suffix = bytes2(_payload[audRightIndex:audRightIndex + 2]);
        require(suffix == bytes2('",') || suffix == bytes2('"}'), "_getAud: INVALID_AUD_RIGHT");

        aud = _payload[audLeftIndex:audRightIndex];
    }
}
