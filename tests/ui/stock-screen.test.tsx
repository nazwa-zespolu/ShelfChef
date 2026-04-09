/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { StockScreen } from "../../src/app/screens/StockScreen";

describe("UI: StockScreen", () => {
  it("displays list of products sorted by expiration date", () => {
    const products = [
      { id: "1", name: "Jogurt", expirationDate: "2026-04-10", quantity: 2 },
      { id: "2", name: "Mleko", expirationDate: "2026-04-09", quantity: 1 },
    ];

    render(<StockScreen products={products} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Mleko");
    expect(items[1]).toHaveTextContent("Jogurt");
  });

  it("shows empty state when no products", () => {
    render(<StockScreen products={[]} />);

    expect(screen.getByText(/brak produktów/i)).toBeTruthy();
  });
});
