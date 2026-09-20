import { render, screen } from '@testing-library/react';
import App from './App';

test('renders clinic branding and doctor profile', () => {
  render(<App />);
  const clinicElements = screen.getAllByText(/Baak o Shrobon Kendra|বাক ও শ্রবণ কেন্দ্র/i);
  expect(clinicElements.length).toBeGreaterThan(0);

  const doctorNameElements = screen.getAllByText(/Avijit Choudhury|অভিজিৎ চৌধুরী/i);
  expect(doctorNameElements.length).toBeGreaterThan(0);
});
