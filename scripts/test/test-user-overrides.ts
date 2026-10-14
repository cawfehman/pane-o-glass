import { prisma } from "../../src/lib/prisma";
import { 
    getPermissionsForRole, 
    getEffectivePermissions, 
    hasPermission 
} from "../../src/app/actions/permissions";

/**
 * Automated Test Suite: Hybrid RBAC & Per-User Tool Access Overrides
 * Run with: npx tsx scripts/test/test-user-overrides.ts
 */

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`  ✅ PASS: ${testName}`);
    } else {
        failedTests++;
        console.error(`  ❌ FAIL: ${testName}`);
        if (details) console.error(`     Details: ${details}`);
    }
}

async function runTestSuite() {
    console.log("===============================================================");
    console.log("   AUTOMATED TEST SUITE: USER TOOL ACCESS OVERRIDES & RBAC     ");
    console.log("===============================================================\n");

    const TEST_USERNAME = "test_perm_runner_" + Date.now();
    let createdUser: any = null;

    try {
        // -----------------------------------------------------------------
        // TEST SUITE 1: Baseline Role Permissions
        // -----------------------------------------------------------------
        console.log("▶ Test Suite 1: Baseline Role Entitlements");

        const iamPerms = await getPermissionsForRole("IAM");
        assert(
            iamPerms.includes("account-lockout") && iamPerms.includes("hibp-account"),
            "IAM role baseline contains account-lockout and hibp-account",
            `Found: ${JSON.stringify(iamPerms)}`
        );
        assert(
            !iamPerms.includes("netscaler") && !iamPerms.includes("vpn") && !iamPerms.includes("firewall"),
            "IAM role baseline restricts netscaler, vpn, and firewall by default"
        );

        const desktopPerms = await getPermissionsForRole("DESKTOP");
        assert(
            desktopPerms.includes("account-lockout") && desktopPerms.includes("firewall"),
            "DESKTOP role contains account-lockout and firewall"
        );

        const userPerms = await getPermissionsForRole("USER");
        assert(
            !userPerms.includes("account-lockout"),
            "USER role is blocked from account-lockout by default"
        );

        const adminPerms = await getPermissionsForRole("ADMIN");
        assert(
            adminPerms.includes("account-lockout") && adminPerms.includes("firewall") && adminPerms.includes("netscaler"),
            "ADMIN role contains unrestricted access to all tools"
        );

        console.log("");

        // -----------------------------------------------------------------
        // TEST SUITE 2: Per-User Additive Overrides (Enhanced Access)
        // -----------------------------------------------------------------
        console.log("▶ Test Suite 2: Per-User Additive Overrides (Enhanced Grants)");

        createdUser = await prisma.user.create({
            data: {
                username: TEST_USERNAME,
                role: "IAM",
                isExternal: false,
                firstName: "Test",
                lastName: "User"
            }
        });

        console.log(`  ℹ️ Created mock IAM user '${createdUser.username}' (ID: ${createdUser.id})`);

        // Check pre-override state
        const preEffective = await getEffectivePermissions(createdUser.id, createdUser.role);
        assert(
            !preEffective.includes("netscaler") && !preEffective.includes("vpn-s2s"),
            "Pre-override: User does NOT have access to netscaler or vpn-s2s"
        );

        const preHasNetscaler = await hasPermission(createdUser.role, "netscaler", createdUser.id);
        assert(
            preHasNetscaler === false,
            "Pre-override: hasPermission('IAM', 'netscaler', userId) returns false"
        );

        // Grant Enhanced Access for netscaler & vpn-s2s
        await prisma.userToolOverride.createMany({
            data: [
                { userId: createdUser.id, toolId: "netscaler", isEnabled: true },
                { userId: createdUser.id, toolId: "vpn-s2s", isEnabled: true }
            ]
        });

        const postEffective = await getEffectivePermissions(createdUser.id, createdUser.role);
        assert(
            postEffective.includes("netscaler") && postEffective.includes("vpn-s2s"),
            "Post-override: Effective permissions successfully include enhanced grants (netscaler & vpn-s2s)",
            `Effective: ${JSON.stringify(postEffective)}`
        );
        assert(
            postEffective.includes("account-lockout") && postEffective.includes("hibp-account"),
            "Post-override: Base role permissions (account-lockout, hibp-account) remain preserved"
        );

        const postHasNetscaler = await hasPermission(createdUser.role, "netscaler", createdUser.id);
        const postHasVpnS2S = await hasPermission(createdUser.role, "vpn-s2s", createdUser.id);
        assert(
            postHasNetscaler === true && postHasVpnS2S === true,
            "hasPermission() evaluates to true for enhanced tools when userId is provided"
        );

        console.log("");

        // -----------------------------------------------------------------
        // TEST SUITE 3: Per-User Explicit Deny
        // -----------------------------------------------------------------
        console.log("▶ Test Suite 3: Per-User Explicit Deny Overrides");

        // The user normally has account-lockout from IAM. Set an explicit deny override.
        await prisma.userToolOverride.upsert({
            where: { userId_toolId: { userId: createdUser.id, toolId: "account-lockout" } },
            update: { isEnabled: false },
            create: { userId: createdUser.id, toolId: "account-lockout", isEnabled: false }
        });

        const denyEffective = await getEffectivePermissions(createdUser.id, createdUser.role);
        assert(
            !denyEffective.includes("account-lockout"),
            "Explicit Deny: account-lockout removed from effective permissions despite IAM role baseline",
            `Effective: ${JSON.stringify(denyEffective)}`
        );

        const hasDeniedTool = await hasPermission(createdUser.role, "account-lockout", createdUser.id);
        assert(
            hasDeniedTool === false,
            "hasPermission('IAM', 'account-lockout', userId) returns false when explicitly denied"
        );

        console.log("");

        // -----------------------------------------------------------------
        // TEST SUITE 4: Reversion to Role Defaults (Override Removal)
        // -----------------------------------------------------------------
        console.log("▶ Test Suite 4: Override Reversion & Pure Role Inheritance");

        // Delete all overrides for the user
        await prisma.userToolOverride.deleteMany({
            where: { userId: createdUser.id }
        });

        const revertedEffective = await getEffectivePermissions(createdUser.id, createdUser.role);
        assert(
            revertedEffective.includes("account-lockout") && revertedEffective.includes("hibp-account"),
            "Reversion: Base IAM tools restored automatically after deleting overrides"
        );
        assert(
            !revertedEffective.includes("netscaler") && !revertedEffective.includes("vpn-s2s"),
            "Reversion: Enhanced grant tools cleanly removed after deleting overrides"
        );

        const revertedNetscaler = await hasPermission(createdUser.role, "netscaler", createdUser.id);
        assert(
            revertedNetscaler === false,
            "hasPermission() for non-role tool returns false after override removal"
        );

        console.log("");

        // -----------------------------------------------------------------
        // TEST SUITE 5: Admin Role Immunity
        // -----------------------------------------------------------------
        console.log("▶ Test Suite 5: Administrator Access Immunity");

        // Even if an explicit deny exists, ADMIN role always retains access
        await prisma.userToolOverride.upsert({
            where: { userId_toolId: { userId: createdUser.id, toolId: "firewall" } },
            update: { isEnabled: false },
            create: { userId: createdUser.id, toolId: "firewall", isEnabled: false }
        });

        const adminBypassCheck = await hasPermission("ADMIN", "firewall", createdUser.id);
        assert(
            adminBypassCheck === true,
            "ADMIN role bypasses explicit user overrides (Admin retains universal access)"
        );

        console.log("");

    } catch (err: any) {
        console.error("❌ UNHANDLED EXCEPTION DURING TEST RUN:", err);
        failedTests++;
    } finally {
        // Clean up mock user & overrides
        if (createdUser?.id) {
            await prisma.userToolOverride.deleteMany({ where: { userId: createdUser.id } }).catch(() => {});
            await prisma.user.delete({ where: { id: createdUser.id } }).catch(() => {});
            console.log(`  🧹 Cleaned up mock test user '${createdUser.username}'.`);
        }
    }

    console.log("===============================================================");
    console.log(`   TEST RESULTS: ${passedTests} Passed, ${failedTests} Failed (Total: ${totalTests})`);
    console.log("===============================================================\n");

    if (failedTests > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runTestSuite();
