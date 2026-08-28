const { PrismaClient } = require('@prisma/client');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
    console.time("Raw SQL Query");
    const results = await prisma.$queryRaw`
        SELECT "sourceIp", MAX("createdAt") as latest_date
        FROM "VpnEvent"
        WHERE "sourceIp" IS NOT NULL
          AND ("ipAsn" IS NULL OR "ipCountry" IS NULL)
        GROUP BY "sourceIp"
        ORDER BY latest_date DESC
        LIMIT 10;
    `;
    console.timeEnd("Raw SQL Query");

    console.log("Top 10 Most Recent Unenriched IPs:", results);
}

main().finally(() => prisma.$disconnect());
