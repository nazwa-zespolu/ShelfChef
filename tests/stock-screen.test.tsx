import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { StockScreen } from "../src/presentation/screens/StockScreen";

describe("StockScreen", () => {
  it("calls get stock use case after clicking refresh", async () => {
    const getStockUseCase = {
      execute: jest.fn().mockResolvedValue([{ id: "1", name: "Milk" }]),
    };

    render(<StockScreen getStockUseCase={getStockUseCase} />);

    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));

    expect(getStockUseCase.execute).toHaveBeenCalledTimes(1);
  });
});
