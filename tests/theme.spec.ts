import { test, expect } from '@playwright/test';

test.describe('Theme Engine', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.locator('#username').fill('test_admin');
    await page.locator('#password').fill('testpassword123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL('/');
  });

  test('should toggle themes correctly', async ({ page }) => {
    // Open user menu
    await page.locator('button').filter({ hasText: 'test_admin' }).first().click();
    
    await page.getByRole('link', { name: 'My Profile' }).click();
    await expect(page).toHaveURL(/.*\/profile/);
    
    // There should be a theme selector in the user menu or somewhere on the screen
    // We'll click the first theme option
    const defaultTheme = await page.evaluate(() => document.documentElement.className);
    
    await page.getByText('Midnight Purple').click();
    
    // Check if the className changed
    const newTheme = await page.evaluate(() => document.documentElement.className);
    expect(newTheme).not.toBe(defaultTheme);
    expect(newTheme).toContain('theme-midnight');
    
    // Validate it persists after reload
    await page.reload();
    const reloadedTheme = await page.evaluate(() => document.documentElement.className);
    expect(reloadedTheme).toContain('theme-midnight');
  });
});
