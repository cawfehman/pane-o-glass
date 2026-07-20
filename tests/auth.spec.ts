import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should render the login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/InfoSec Tools/i);
    await expect(page.locator('form')).toBeVisible();
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
  });

  test('should fail login with incorrect credentials', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#username').fill('test_admin');
    await page.locator('#password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign In' }).click();

    // The app should display an error message
    await expect(page.locator('text=Invalid')).toBeVisible();
    // Should still be on the login page
    await expect(page).toHaveURL(/.*login/);
  });

  test('should login successfully as admin', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#username').fill('test_admin');
    await page.locator('#password').fill('testpassword123');
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Should redirect to dashboard
    await expect(page).toHaveURL('/');
    // Check if sidebar has user's name or role
    await expect(page.locator('nav')).toBeVisible();
    // Assuming the user menu shows the username
    await expect(page.getByRole('button', { name: 'test_admin' })).toBeVisible();
  });
});
