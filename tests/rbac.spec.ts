import { test, expect, Page } from '@playwright/test';

async function loginAs(page: Page, username: string) {
  await page.goto('/login');
  await page.locator('#username').fill(username);
  await page.locator('#password').fill('testpassword123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL('/');
}

test.describe('Role-Based Access Control', () => {
  test('ADMIN should see all admin links', async ({ page }) => {
    await loginAs(page, 'test_admin');
    
    // Admins should see the Admin category in the sidebar
    await expect(page.getByText('Settings & Admin')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Account Management' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Tool Permissions' })).toBeVisible();
    
    // Admins should be able to navigate to Permissions
    await page.goto('/users/permissions');
    await expect(page).not.toHaveURL('/unauthorized');
    await expect(page.locator('h1', { hasText: 'Tool Permissions' })).toBeVisible();
  });

  test('USER should not see admin links and be blocked from direct access', async ({ page }) => {
    await loginAs(page, 'test_user');
    
    // Regular users shouldn't see Admin navigation
    await expect(page.getByText('Settings & Admin')).not.toBeVisible();
    await expect(page.getByRole('link', { name: 'Tool Permissions' })).not.toBeVisible();
    
    // If they try to go directly to the URL, they should be redirected
    await page.goto('/users/permissions');
    
    // NextAuth usually redirects unauthorized access to the home page or a 403
    // We will check that they don't land on the permissions page
    await expect(page.locator('h1', { hasText: 'Tool Permissions' })).not.toBeVisible();
  });
});
