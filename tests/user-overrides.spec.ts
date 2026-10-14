import { test, expect, Page } from '@playwright/test';

async function loginAs(page: Page, username: string) {
  await page.goto('/login');
  await page.locator('#username').fill(username);
  await page.locator('#password').fill('testpassword123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL('/');
}

test.describe('Per-User Tool Access Overrides UI', () => {
  test('ADMIN can open and view Tool Access Overrides modal on Account Management page', async ({ page }) => {
    await loginAs(page, 'test_admin');

    // Navigate to Account Management
    await page.goto('/users');
    await expect(page.locator('h1', { hasText: 'Local Accounts' })).toBeVisible();

    // Verify existing accounts table is rendered
    await expect(page.locator('table')).toBeVisible();

    // Find the Tool Overrides button (Key icon) for any non-admin account
    const overrideBtn = page.locator('button[title="Manage Tool Access Overrides"]').first();
    await expect(overrideBtn).toBeVisible();

    // Click to open the modal
    await overrideBtn.click();

    // Assert modal header appears
    const modal = page.locator('div.fixed.inset-0');
    await expect(modal).toBeVisible();
    await expect(modal.locator('h2', { hasText: 'Tool Access Overrides:' })).toBeVisible();

    // Assert tool categories are displayed
    await expect(modal.getByText('Perimeter & Access')).toBeVisible();
    await expect(modal.getByText('VPN Solutions')).toBeVisible();
    await expect(modal.getByText('Threat Intelligence & Telemetry')).toBeVisible();

    // Assert Account Lockout tool is present inside modal
    await expect(modal.getByText('Account Lockout Investigator')).toBeVisible();

    // Close the modal
    const closeBtn = modal.locator('button:has-text("Cancel")');
    await closeBtn.click();
    await expect(modal).not.toBeVisible();
  });
});
