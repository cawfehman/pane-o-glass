import { prisma } from "../../src/lib/prisma";
import { 
    getResolvedRoleDefaults, 
    SYSTEM_DEFAULT_PERMISSIONS_MAP,
    hasPermission,
    getPermissionsForRole
} from "../../src/app/actions/permissions";

async function runRoleDefaultsTests() {
    console.log("[TEST] Testing Role Default Permissions & Persistence");
    console.log("=".repeat(80));

    // Cleanup any lingering test defaults
    await prisma.roleDefaultPermission.deleteMany({
        where: {
            role: "TEST_ROLE"
        }
    });

    try {
        // 1. Verify baseline system defaults
        const baseline = await getResolvedRoleDefaults();
        if (!baseline.defaults['account-lockout']) {
            throw new Error("account-lockout missing from baseline defaults");
        }
        if (baseline.defaults['account-lockout']['USER'] !== false) {
            throw new Error("USER should not have account-lockout by default");
        }
        if (baseline.defaults['account-lockout']['IAM'] !== true) {
            throw new Error("IAM should have account-lockout by default");
        }
        console.log("PASS: Baseline role defaults resolve correctly");

        // 2. Insert custom default in database
        const testToolId = "test-custom-tool";
        await prisma.roleDefaultPermission.upsert({
            where: {
                toolId_role: { toolId: testToolId, role: "USER" }
            },
            update: { isEnabled: true },
            create: { toolId: testToolId, role: "USER", isEnabled: true }
        });

        const withCustom = await getResolvedRoleDefaults();
        if (withCustom.defaults[testToolId]?.['USER'] !== true) {
            throw new Error("Custom role default was not reflected in getResolvedRoleDefaults");
        }
        if (!withCustom.isCustomized) {
            throw new Error("isCustomized flag should be true when custom defaults exist");
        }
        console.log("PASS: Custom role default successfully persisted and resolved");

        // 3. Test hasPermission with custom default fallback
        const hasAccess = await hasPermission("USER", testToolId);
        if (!hasAccess) {
            throw new Error("hasPermission should return true via custom role default");
        }
        console.log("PASS: hasPermission correctly falls back to custom role default");

        // 4. Test modifying an existing default tool
        await prisma.roleDefaultPermission.upsert({
            where: {
                toolId_role: { toolId: "vpn-s2s", role: "USER" }
            },
            update: { isEnabled: true },
            create: { toolId: "vpn-s2s", role: "USER", isEnabled: true }
        });

        const userPerms = await getPermissionsForRole("USER");
        if (!userPerms.includes("vpn-s2s")) {
            throw new Error("getPermissionsForRole should include vpn-s2s when custom default is true");
        }
        console.log("PASS: getPermissionsForRole inherits updated custom role default");

        // 5. Cleanup test records
        await prisma.roleDefaultPermission.deleteMany({
            where: {
                toolId: { in: [testToolId, "vpn-s2s"] },
                role: "USER"
            }
        });
        console.log("PASS: Cleaned up test custom defaults");

        const reverted = await getResolvedRoleDefaults();
        if (reverted.defaults[testToolId]?.['USER']) {
            throw new Error("Test tool should not be present after cleanup");
        }
        if (reverted.defaults['vpn-s2s']['USER'] !== false) {
            throw new Error("vpn-s2s for USER should revert to false");
        }
        console.log("PASS: Role defaults cleanly reverted to factory baseline");

        console.log("=".repeat(80));
        console.log("ALL ROLE DEFAULTS TESTS PASSED!");
    } finally {
        await prisma.$disconnect();
    }
}

runRoleDefaultsTests().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
