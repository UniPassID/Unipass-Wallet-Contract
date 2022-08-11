// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "./modules/commons/ModuleAdminAuth.sol";
import "./modules/utils/LibDkim.sol";
import "./interfaces/IDkimKeys.sol";
import "./utils/LibRsa.sol";
import "./utils/LibBytes.sol";

contract DkimKeys is IDkimKeys, ModuleAdminAuth {
    using LibDkimValidator for DkimParams;
    using LibSlice for Slice;
    using LibBytes for bytes;

    mapping(bytes => bytes) private dkimKeys;

    event UpdateDKIMKey(bytes emailServer, bytes oldKey, bytes newKey);
    event DeleteDKIMKey(bytes emailServer, bytes oldKey);

    constructor(address _admin) ModuleAdminAuth(_admin) {
        dkimKeys[
            abi.encodePacked("20161025", "gmail.com")
        ] = hex"be23c6064e1907ae147d2a96c8089c751ee5a1d872b5a7be11845056d28384cfb59978c4a91b4ffe90d3dec0616b3926038f27da4e4d254c8c1283bc9dcdabeac500fbf0e89b98d1059a7aa832893b08c9e51fcea476a69511be611250a91b6a1204a22561bb87b79f1985a687851184533d93dfab986fc2c02830c7b12df9cf0e3259e068b974e3f6cf99fa63744c8b5b23629a4efad425fa2b29b3622443373d4c389389ececc5692e0f15b54b9f49b999fd0754db41a4fc16b8236f68555f9546311326e56c1ea1fe858e3c66f3a1282d440e3b487579dd2c198c8b15a5bab82f1516f48c4013063319c4a06789f943c5fc4e7768c2c0d4ce871c3c51a177";

        dkimKeys[
            abi.encodePacked("20161025", "googlemail.com")
        ] = hex"be23c6064e1907ae147d2a96c8089c751ee5a1d872b5a7be11845056d28384cfb59978c4a91b4ffe90d3dec0616b3926038f27da4e4d254c8c1283bc9dcdabeac500fbf0e89b98d1059a7aa832893b08c9e51fcea476a69511be611250a91b6a1204a22561bb87b79f1985a687851184533d93dfab986fc2c02830c7b12df9cf0e3259e068b974e3f6cf99fa63744c8b5b23629a4efad425fa2b29b3622443373d4c389389ececc5692e0f15b54b9f49b999fd0754db41a4fc16b8236f68555f9546311326e56c1ea1fe858e3c66f3a1282d440e3b487579dd2c198c8b15a5bab82f1516f48c4013063319c4a06789f943c5fc4e7768c2c0d4ce871c3c51a177";

        dkimKeys[
            abi.encodePacked("s201512", "qq.com")
        ] = hex"cfb0520e4ad78c4adb0deb5e605162b6469349fc1fde9269b88d596ed9f3735c00c592317c982320874b987bcc38e8556ac544bdee169b66ae8fe639828ff5afb4f199017e3d8e675a077f21cd9e5c526c1866476e7ba74cd7bb16a1c3d93bc7bb1d576aedb4307c6b948d5b8c29f79307788d7a8ebf84585bf53994827c23a5";

        dkimKeys[
            abi.encodePacked("s201512", "foxmail.com")
        ] = hex"cfb0520e4ad78c4adb0deb5e605162b6469349fc1fde9269b88d596ed9f3735c00c592317c982320874b987bcc38e8556ac544bdee169b66ae8fe639828ff5afb4f199017e3d8e675a077f21cd9e5c526c1866476e7ba74cd7bb16a1c3d93bc7bb1d576aedb4307c6b948d5b8c29f79307788d7a8ebf84585bf53994827c23a5";

        dkimKeys[
            abi.encodePacked("s110527", "163.com")
        ] = hex"a9f49a52ec4391363c089ed5c8235ee626ec286fe849a15987af68761cfa5213b418821f35e641dd602e096f15e070fd26359398dd1d5593a7540d1f0d4222fec41f5f44d5854b7e93abb0b33c4fd423ff8fc5684fccf9ef001af881b41cadeb3c79ef5c80430f143a5c9383bb50b3493711f4d3739f7268752bec431b2a8f59";

        dkimKeys[
            abi.encodePacked("s110527", "126.com")
        ] = hex"a9f49a52ec4391363c089ed5c8235ee626ec286fe849a15987af68761cfa5213b418821f35e641dd602e096f15e070fd26359398dd1d5593a7540d1f0d4222fec41f5f44d5854b7e93abb0b33c4fd423ff8fc5684fccf9ef001af881b41cadeb3c79ef5c80430f143a5c9383bb50b3493711f4d3739f7268752bec431b2a8f59";

        dkimKeys[
            abi.encodePacked("s110527", "yeah.net")
        ] = hex"a9f49a52ec4391363c089ed5c8235ee626ec286fe849a15987af68761cfa5213b418821f35e641dd602e096f15e070fd26359398dd1d5593a7540d1f0d4222fec41f5f44d5854b7e93abb0b33c4fd423ff8fc5684fccf9ef001af881b41cadeb3c79ef5c80430f143a5c9383bb50b3493711f4d3739f7268752bec431b2a8f59";

        dkimKeys[
            abi.encodePacked("s110527", "188.com")
        ] = hex"a9f49a52ec4391363c089ed5c8235ee626ec286fe849a15987af68761cfa5213b418821f35e641dd602e096f15e070fd26359398dd1d5593a7540d1f0d4222fec41f5f44d5854b7e93abb0b33c4fd423ff8fc5684fccf9ef001af881b41cadeb3c79ef5c80430f143a5c9383bb50b3493711f4d3739f7268752bec431b2a8f59";

        dkimKeys[
            abi.encodePacked("s110527", "vip.163.com")
        ] = hex"a9f49a52ec4391363c089ed5c8235ee626ec286fe849a15987af68761cfa5213b418821f35e641dd602e096f15e070fd26359398dd1d5593a7540d1f0d4222fec41f5f44d5854b7e93abb0b33c4fd423ff8fc5684fccf9ef001af881b41cadeb3c79ef5c80430f143a5c9383bb50b3493711f4d3739f7268752bec431b2a8f59";

        dkimKeys[
            abi.encodePacked("s110527", "vip.126.com")
        ] = hex"a9f49a52ec4391363c089ed5c8235ee626ec286fe849a15987af68761cfa5213b418821f35e641dd602e096f15e070fd26359398dd1d5593a7540d1f0d4222fec41f5f44d5854b7e93abb0b33c4fd423ff8fc5684fccf9ef001af881b41cadeb3c79ef5c80430f143a5c9383bb50b3493711f4d3739f7268752bec431b2a8f59";

        dkimKeys[
            abi.encodePacked("s110527", "vip.188.com")
        ] = hex"a9f49a52ec4391363c089ed5c8235ee626ec286fe849a15987af68761cfa5213b418821f35e641dd602e096f15e070fd26359398dd1d5593a7540d1f0d4222fec41f5f44d5854b7e93abb0b33c4fd423ff8fc5684fccf9ef001af881b41cadeb3c79ef5c80430f143a5c9383bb50b3493711f4d3739f7268752bec431b2a8f59";

        dkimKeys[
            abi.encodePacked("s2048", "yahoo.com")
        ] = hex"ba85ae7e06d6c39f0c7335066ccbf5efa45ac5d64638c9109a7f0e389fc71a843a75a95231688b6a3f0831c1c2d5cb9b271da0ce200f40754fb4561acb22c0e1ac89512364d74feea9f072894f2a88f084e09485ae9c5f961308295e1bb7e835b87c3bc0bce0b827f8600a11e97c54291b00a07ba817b33ebfa6cc67f5f51bebe258790197851f80943a3bc17572428aa19e4aa949091f9a436aa6e0b3e1773e9ca201441f07a104cce03528c3d15891a9ce03ed2a8ba40dc42e294c3d180ba5ee4488c84722ceaadb69428d2c6026cf47a592a467cc8b15a73ea3753d7f615e518ba614390e6c3796ea37367c4f1a109646d5472e9e28e8d49e84924e648087";

        dkimKeys[
            abi.encodePacked("dbd5af2cbaf7", "mail.com")
        ] = hex"ede596d226cb20962f0813f0f77192bffa52b5ef8668a4eee295ce446ec8f683edbb7ad2373023ff3267d44c1ba792381f68dbee3d17431db3e11f521513f126444a0cc134cb702bd693f7a000be9f0c6b57f2b67ea2462de0ef85c9929b937bd5f58e66882b82b9d23e08648318602c8de499e9b1287b6682a3f2dd3e22e2f5";

        dkimKeys[
            abi.encodePacked("selector1", "outlook.com")
        ] = hex"bd6ca4b6b20bf033bff941af31bbfb70f77f5e88296ecee9815c3ccbd95d3ba00032683cfa28c4365fdcec56f531f28ceee1b72ccc00af475554ac8cfa66e4a17da4e4bee5b11390af467d8064a9bbbc6b9d939ae7cfbfa4885dd9793f0c53e96b9f9329b5a875bb1264f44df33d11639c79f6377349c957944c8df661197663a2293b0e3fa03bbd0c5f4b26bd8e0e4df3575f34dbcfec79d67a330cb0ac8832b5e9b713a1201b84607ebb2437bdf10817d78a07bc6336533e7789ffd25bc305d3dad887db29e19b1a58b220e93df8dc9ce56edaec1911820c9f493e9c515998a6b73f94a7f0652b34fab020ab06285bfc18b7a59884041e148bfbebb8be5109";

        dkimKeys[
            abi.encodePacked("selector1", "hotmail.com")
        ] = hex"bd6ca4b6b20bf033bff941af31bbfb70f77f5e88296ecee9815c3ccbd95d3ba00032683cfa28c4365fdcec56f531f28ceee1b72ccc00af475554ac8cfa66e4a17da4e4bee5b11390af467d8064a9bbbc6b9d939ae7cfbfa4885dd9793f0c53e96b9f9329b5a875bb1264f44df33d11639c79f6377349c957944c8df661197663a2293b0e3fa03bbd0c5f4b26bd8e0e4df3575f34dbcfec79d67a330cb0ac8832b5e9b713a1201b84607ebb2437bdf10817d78a07bc6336533e7789ffd25bc305d3dad887db29e19b1a58b220e93df8dc9ce56edaec1911820c9f493e9c515998a6b73f94a7f0652b34fab020ab06285bfc18b7a59884041e148bfbebb8be5109";

        dkimKeys[
            abi.encodePacked("20210112", "gmail.com")
        ] = hex"abc27154130b1d9463d56bc83121c0a516370eb684fc4885891e88300943abd1809eb572d2d0d0c81343d46f3ed5fcb9470b2c43d0e07cd7bbac89b0c5a6d67d6c49d4b4a6a3f0f311d38738935088ffe7c3b31d986bbe47d844bc17864500269f58e43b8e8a230fe9da51af98f49edfe0150fe5f2697678bc919364a1540a7a1cb40554c878d20d3eca9c4b1a88d0f6ad5b03bf28ac254007f84c917e61d20707c954701d27da03f1c9fd36322e9ff1072d2230842c5798b26568978d005b5c19e0f669119b1da4bb33a69314ffaa9387f6b9c471df57320b16eee7408355f53e778264203341143895f8c22968315721fd756c6a12d3ca010508b23d7817d3";

        dkimKeys[
            abi.encodePacked("20210112", "googlemail.com")
        ] = hex"abc27154130b1d9463d56bc83121c0a516370eb684fc4885891e88300943abd1809eb572d2d0d0c81343d46f3ed5fcb9470b2c43d0e07cd7bbac89b0c5a6d67d6c49d4b4a6a3f0f311d38738935088ffe7c3b31d986bbe47d844bc17864500269f58e43b8e8a230fe9da51af98f49edfe0150fe5f2697678bc919364a1540a7a1cb40554c878d20d3eca9c4b1a88d0f6ad5b03bf28ac254007f84c917e61d20707c954701d27da03f1c9fd36322e9ff1072d2230842c5798b26568978d005b5c19e0f669119b1da4bb33a69314ffaa9387f6b9c471df57320b16eee7408355f53e778264203341143895f8c22968315721fd756c6a12d3ca010508b23d7817d3";

        dkimKeys[
            abi.encodePacked("protonmail", "protonmail.com")
        ] = hex"ca678aeacca0caadf24728d7d3821d41ff736da07ad1f13e185d3b8796da4526585cf867230c4a5fdadbf31e747b47b11b84e762c32e122e0097a8421141eeecc0e4fcbeae733d9ebf239d28f22b31cf9d10964bcda085b27a2350aa50cf40b41ecb441749f2f39d063f6c7c6f280a808b7dc2087c12fce3eeb96707abc0c2a9";

        dkimKeys[
            abi.encodePacked("eth", "unipass.id")
        ] = hex"8d74c57e6c2736060b667c71bfa0beec86f13b89e29502f537101de6af3dc1a9e1e31d1490ddd739509d6c5ed7faecfed1392665f312939c3f0314700c2f22e38d54d3f57c423101bffa7b807f8c9e0e2619e8ecf63d1afae22ae6269126a8a9ac3b6ecbd8176f8065f275688a5598e0dc8b77a5341873c5024c2d1c0f3e628d";

        dkimKeys[
            abi.encodePacked("protonmail", "pm.me")
        ] = hex"a66408196cdf68bf5c7be5611dcad34f32bdaf19fc1f7f4f3eeff3b833b98af8baf1accc646cfc6aa3d3bcc017471d96b58bddf5b3e3897d9fb6172050fc86da55246122c4cb973ea027d69faf8e0e656cff6d1f2bad70d42d2eedf38ccd8b203a39a9d8aa133dc401a721df31b566cc219eb9ee55256be36a8d0a5f51849c39999d9d0cad3705e5b4a243ab40b9457818d1f27f2b2101e03021201bf94b4093d83e2e9e218c3bb12ee1cad100ef04d2b54ddbb42c6e1b138da18f780dea12cf7cda903556ebc1969b49c5ae0262e84add20afbe5cd11f9087d8fd181081f2169d7501b27019b2684092eef62b0c8c7c8093e3995f919516fe55e7fa01dbbda5";

        dkimKeys[
            abi.encodePacked("1a1hai", "icloud.com")
        ] = hex"d5911f6e47f84db3b64c3648ebb5a127a1bc0f0937489c806c1944fd029dc971590781df114ec072e641cdc5d2245134dc3966c8e91402669a47cc85970a281f268a44b21a4f77a91a52f9606a30c9f22d2e5cb6934263d08388091c56ac1dfbf1beea31e8a613c2a51f550d695a514d38b45c862320a00ea539419a433d6bfdd1978356cbca4b600a570fe582918c4f731a0002068df28b2a193089e6bf951c553b5a6f71aaadcc6669dfa346f322717851a8c22a324041af8736e87de4358860fff057beff3f19046a43adce46c932514988afe1309f87414bd36ed296dacfade2e0caf03235e91a2db27e9ed214bcc6e5cf995b5ef59ce9943d1f4209b6ab";

        dkimKeys[
            abi.encodePacked("1ca1ba", "icloud.com")
        ] = hex"c98924fd152c4166028dd31acba0ece995af40b179fed81f25362aa274ea4cb12e60fe650336631867149036380b5e52069d8500e582906ad3c2ae7a87ee9ef7c1e3a06370af40451bd6fb157b621654e0bbebb3fa9de6d862ab783972de5610ef9da04c14e863d604f9d9166c1a027a1c67e580bd7b988dc8915245af8031a1a513cb4c10e36930105a74a2af50b8f852ea260f6f86bfc195d73c3292d886c8a2dd259013124b637037b25464850d80f52aa73f7823288514fe11ea7910a0e2d41e46667180554389b8eddf588549f533606ba1dcbc943c9fca4db43c3d93009e8d2d89283d1847d6245261b1300f255743d8e06d2e6ba167c5f05f35c83125";

        dkimKeys[
            abi.encodePacked("protonmail2", "protonmail.com")
        ] = hex"a9c499799ec7a22011a1a1821a5c86fd0e770169c5e4f7958e4b604663167853af23322b36a6d869ae618e5eee751a53b506db5a4c93517a2d50bf937225d4ee6a03793dc969db81345214eec777e5df808c9f16406b8f72e787d705590f9c6cb682ebaba72ac9fb56b2f23f05c8af7c197f364445070865e05452baa5cf444571d6dd2c0f5b8aa3e97be1b84ec1fd4d021fdde175258b8c17e52f7ba32a4210bccdae5947f417f563cf44f9b06c80eede484228970324b565a63741f816a3b2bd3a14b86d30e65299f0a5e7896339931683292e2d0d2280c6f2a704989f8709e323380fe40085a05970c8c5ad4006d150dff204a9953bd6cdcb2e0ebc7f54b1";

        dkimKeys[
            abi.encodePacked("protonmail2", "pm.me")
        ] = hex"b1dfac7052467ccf79f7870f2aa3a514effcbb0da7e5981945b386512de1fd9dd70bae840b13aac4a6083b585228825e7be1e0ea144746598e42ca340279c8039e2d13c066f33ff30bb97c231350c2c3d4169fd9d73d1fd1acf2d650ddeba77852ed8fbb8f1177ac717d4cb3eecfd38317b939ce98a858f1dc0e5dabcaf9be9636b6a24ec74d6dc532496aaa83b2d9f7191aedb595073a99baa5524093c7629f4b39ca20e6c1a17f894e18e5e44fa7ea4a7177bb4038c2bcbbab413e733494bbae41ae70ec059791b2e508f396058b9e6a2c581417f7a4f59332460f08a2565ed057182a1e34a3ece7ab9622b131472104c4fbed30c672012571847bba281b25";

        dkimKeys[
            abi.encodePacked("protonmail3", "protonmail.com")
        ] = hex"ce616b9af91a54e135d2e79ea0438c8e8b698faeed33e6cd0006ff5c40db87f7cfa168db932cecc51fc76dc121ee57c9cab4e5e19fb8cec269b527fb3f9f9dd69b8588bb023fc5be2e7e5fe2524d769edc104b2ce2fd2e33c87671ecfcf4f652ba80f6ea1e5c7c59e745dcbb774e408345db13fbd82efd647561c7c0afd4c4bdba1abb0a25c4ca70da3e524c771a75ea86c24934bcbf514600232e30de64509f18dd134282ef87d0051ffb5b08906f8ec96d04c3889685b6286207708d77afe165f8b97ec1aca32a565d1fee2ff2e241c4c6802f2048ce18b92033c08b941383feff6ddd380f25f355a62d38ca45d8783565f574638f43a6bdde72275247d39b";

        dkimKeys[
            abi.encodePacked("protonmail3", "pm.me")
        ] = hex"b1929caebbdbfc48b036f6b8b0d3ec94c4c4599d64534d8ff77d8713f52e40ba71068d783e7ee1f454ce009504b5c0739ab256cb2131d03884ad002d1e2abbf921f3d0614df8eb80e423e1cb3a8df3a383a46078c82e4d8085ead422e86afe9f4d7e722548c561c92c39cb2ad36cd6ea6c29ea40827ce0d4e2de9863199670e5c604af6238e56f5d018adaeba59df46807996ed726e39d28d38274b0b3583e482addce9249d9168f85f118222c039abf85e5a9b7209651d6a77c064285ff1f0c1bc45f47d0c764c4d69e0552dc295a17d1ca588d63cdd10a31e1e30eeace43d110d943fce788572d2a096e05cff6e8ec72dc869473c415ec080508478194d661";
    }

    function getDKIMKey(bytes calldata _emailServer) public view override returns (bytes memory) {
        return dkimKeys[_emailServer];
    }

    function updateDKIMKey(bytes calldata _emailServer, bytes calldata key) external onlyAdmin {
        dkimKeys[_emailServer] = key;
        emit UpdateDKIMKey(_emailServer, dkimKeys[_emailServer], key);
    }

    function deleteDKIMKey(bytes calldata _emailServer) external onlyAdmin {
        delete dkimKeys[_emailServer];
        emit DeleteDKIMKey(_emailServer, dkimKeys[_emailServer]);
    }

    function _parseDkimParams(bytes calldata _data, uint256 _index)
        internal
        pure
        returns (DkimParams memory params, uint256 newIndex)
    {
        uint32 emailHeaderLen;
        (emailHeaderLen, newIndex) = _data.cReadUint32(_index);
        params.emailHeader = _data[newIndex:newIndex + emailHeaderLen];
        newIndex += emailHeaderLen;
        uint32 dkimSigLen;
        (dkimSigLen, newIndex) = _data.cReadUint32(newIndex);
        params.dkimSig = _data[newIndex:newIndex + dkimSigLen];
        newIndex += dkimSigLen;
        (params.fromIndex, newIndex) = _data.cReadUint32(newIndex);

        (params.fromLeftIndex, newIndex) = _data.cReadUint32(newIndex);
        (params.fromRightIndex, newIndex) = _data.cReadUint32(newIndex);
        (params.subjectIndex, newIndex) = _data.cReadUint32(newIndex);
        (params.subjectRightIndex, newIndex) = _data.cReadUint32(newIndex);
        uint32 isSubBase64Len;
        (isSubBase64Len, newIndex) = _data.cReadUint32(newIndex);
        params.isSubBase64 = new bool[](isSubBase64Len);
        for (uint32 i = 0; i < isSubBase64Len; i++) {
            params.isSubBase64[i] = _data.mcReadUint8(newIndex) == 1;
            newIndex++;
        }
        uint32 subjectPaddingLen;
        (subjectPaddingLen, newIndex) = _data.cReadUint32(newIndex);
        params.subjectPadding = _data[newIndex:newIndex + subjectPaddingLen];
        newIndex += subjectPaddingLen;
        uint32 subjectLen;
        (subjectLen, newIndex) = _data.cReadUint32(newIndex);
        params.subject = new bytes[](subjectLen);
        for (uint32 i = 0; i < subjectLen; i++) {
            uint32 partLen;
            (partLen, newIndex) = _data.cReadUint32(newIndex);
            params.subject[i] = _data[newIndex:newIndex + partLen];
            newIndex += partLen;
        }
        (params.dkimHeaderIndex, newIndex) = _data.cReadUint32(newIndex);
        (params.selectorIndex, newIndex) = _data.cReadUint32(newIndex);
        (params.selectorRightIndex, newIndex) = _data.cReadUint32(newIndex);
        (params.sdidIndex, newIndex) = _data.cReadUint32(newIndex);
        (params.sdidRightIndex, newIndex) = _data.cReadUint32(newIndex);
    }

    function dkimVerifyParams(DkimParams memory params, bytes calldata inputEmailFrom)
        public
        view
        returns (
            bool ret,
            bytes32 emailHash,
            bytes memory sigHashHex
        )
    {
        bytes memory sdid;
        bytes memory selector;
        bytes memory emailFrom;
        (emailFrom, sigHashHex, sdid, selector) = params._parseHeader();

        require(sigHashHex.length == 66, "dkimVerify: INVALID_SIGHASHHEX");

        Slice memory sdidSlice = LibSlice.toSlice(sdid);
        emailFrom = LibDkimValidator.checkEmailFrom(emailFrom, sdidSlice);
        bytes memory inputEmailFromRet = LibDkimValidator.checkEmailFrom(inputEmailFrom, sdidSlice);
        require(keccak256(emailFrom) == keccak256(inputEmailFromRet), "dkimVerify: INVALID_EMAIL_FROM");
        emailHash = LibDkimValidator.emailAddressHash(inputEmailFrom);

        bytes memory n = this.getDKIMKey(abi.encodePacked(selector, sdid));
        require(n.length > 0, "zero");
        ret = LibRsa.rsapkcs1Verify(sha256(params.emailHeader), n, hex"010001", params.dkimSig);
    }

    function dkimVerify(
        bytes calldata _data,
        uint256 _index,
        bytes calldata _inputEmailFrom
    )
        public
        view
        override
        returns (
            bool ret,
            bytes32 emailHash,
            bytes memory sigHashHex,
            uint256 index
        )
    {
        DkimParams memory params;
        (params, index) = _parseDkimParams(_data, _index);
        (ret, emailHash, sigHashHex) = dkimVerifyParams(params, _inputEmailFrom);
    }
}
