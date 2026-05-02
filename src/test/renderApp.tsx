import { render } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import App from "../App.js";

export function renderApp() {
  const user = userEvent.setup();
  render(<App />);
  return { user };
}
