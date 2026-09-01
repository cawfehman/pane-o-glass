function ip2long(ip) {
    return ip.split('.').reduce((long, octet) => (long << 8) + parseInt(octet, 10), 0) >>> 0;
}

function isPrivateIpBugged(ip) {
    try {
        const ipLong = ipToLong(ip); // bug! ipToLong is undefined!
        return false;
    } catch (e) {
        return true; // silent failure!
    }
}

console.log("Is 8.8.8.8 private (bugged)?", isPrivateIpBugged("8.8.8.8"));
