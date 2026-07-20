import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Log in as an admin before checking navigation
    await page.goto('/login');
    await page.locator('#username').fill('test_admin');
    await page.locator('#password').fill('testpassword123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL('/');
  });

  test('should navigate to Firewall Query tool', async ({ page }) => {
    await page.getByRole('link', { name: 'Cisco Firewall Utilities', exact: true }).click();
    await expect(page).toHaveURL(/.*\/queries\/firewall/);
    await expect(page.locator('h1').filter({ hasText: 'Firewall' })).toBeVisible();
  });

  test('should navigate to Identity Services tool', async ({ page }) => {
    await page.getByRole('link', { name: 'Cisco ISE Center', exact: true }).click();
    await expect(page).toHaveURL(/.*\/queries\/ise/);
    await expect(page.locator('h1').filter({ hasText: 'Cisco ISE Center' })).toBeVisible();
  });
});
