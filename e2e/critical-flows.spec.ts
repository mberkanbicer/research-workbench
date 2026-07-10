import { test, expect } from '@playwright/test';

test.describe('Critical User Flows', () => {
  test('landing page loads with correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Research Workbench/);
  });

  test('project list page renders', async ({ page }) => {
    await page.goto('/projects');
    // Should show the projects page (may be empty or have projects)
    await expect(page.locator('text=Projects').first()).toBeVisible();
  });

  test('create project page renders', async ({ page }) => {
    await page.goto('/projects/new');
    await expect(page.locator('text=Create').first()).toBeVisible();
  });

  test('model settings page renders', async ({ page }) => {
    await page.goto('/settings/models');
    await expect(page.locator('text=Model').first()).toBeVisible();
  });

  test('login page renders', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
  });

  test('signup page renders', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
  });

  test('health endpoint is accessible', async ({ page }) => {
    const response = await page.request.get('http://localhost:4000/health');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  test('API projects endpoint returns data', async ({ page }) => {
    const response = await page.request.get('http://localhost:4000/projects');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBeTruthy();
  });

  test('API models endpoint returns data', async ({ page }) => {
    const response = await page.request.get('http://localhost:4000/models');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBeTruthy();
  });
});
