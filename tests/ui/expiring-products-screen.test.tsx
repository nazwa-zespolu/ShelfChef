/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { ExpiringProductsScreen } from "../../src/app/screens/ExpiringProductsScreen";

describe("UI: ExpiringProductsScreen", () => {
  it("displays products expiring soon", () => {
    const expiringProducts = [
      { id: "1", name: "Mleko", expirationDate: "2026-04-09" },
      { id: "2", name: "Jogurt", expirationDate: "2026-04-10" },
    ];

    render(<ExpiringProductsScreen products={expiringProducts} />);

    expect(screen.getByText("Mleko")).toBeTruthy();
    expect(screen.getByText("Jogurt")).toBeTruthy();
  });

  it("shows message when nothing is expiring", () => {
    render(<ExpiringProductsScreen products={[]} />);

    expect(screen.getByText(/brak kończących się produktów/i)).toBeTruthy();
  });
});
