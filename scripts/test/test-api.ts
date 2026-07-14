import { GET } from "../src/app/api/vpn/events/route";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/prisma";

async function main() {
    console.log("Simulating GET /api/vpn/events...");
    const req = new NextRequest("http://localhost:3000/api/vpn/events");
    const response = await GET(req);
    const data = await response.json();
    
    console.log("ipCache keys in API response:", Object.keys(data.ipCache || {}));
    console.log("successfulIps count:", data.successfulIps?.length);
    if (data.successfulIps?.length > 0) {
        console.log("Sample successfulIp:", JSON.stringify(data.successfulIps[0], null, 2));
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
