import { render, screen } from '@testing-library/react';
import App from './App';

test('renders clinic branding and doctor profile', () => {
  render(<App />);
  const clinicElements = screen.getAllByText(/Baak o Shrobon Kendra/i);
  expect(clinicElements.length).toBeGreaterThan(0);

  const doctorNameElements = screen.getAllByText(/Dr. Avijit Choudhury/i);
  expect(doctorNameElements.length).toBeGreaterThan(0);
});

