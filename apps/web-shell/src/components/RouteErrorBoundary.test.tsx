// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import i18n from '../i18n';
import RouteErrorBoundary from './RouteErrorBoundary';
import type { ReactElement } from 'react';

function BrokenRoute(): ReactElement {
  throw new Error('test route failure');
}

describe('RouteErrorBoundary', () => {
  it('catches route render errors and shows localized recovery action', async () => {
    const router = createMemoryRouter([
      { path: '/broken', element: <BrokenRoute />, errorElement: <RouteErrorBoundary /> },
    ], { initialEntries: ['/broken'] });

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('heading', { name: i18n.t('common.error') })).toBeTruthy();
    expect(screen.getByRole('button', { name: i18n.t('common.retry') })).toBeTruthy();
  });
});
