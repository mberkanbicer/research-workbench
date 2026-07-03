import { test, expect } from '@playwright/test';

test.describe('MVP smoke', () => {
  test('login page renders', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /sign in|log in|login/i })).toBeVisible({ timeout: 15_000 });
  });

  test('projects list or redirect loads', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.locator('body')).toContainText(/Research Projects|Sign in|Log in/i, { timeout: 15_000 });
  });
});