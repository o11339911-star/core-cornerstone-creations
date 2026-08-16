import * as React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RakeezAccordion } from "./rakeez-accordion";

function Harness() {
  const [value, setValue] = React.useState("");
  return (
    <RakeezAccordion
      keepMounted
      value={value}
      onValueChange={setValue}
      items={[
        { value: "boundaries", title: "الحدود والأطوال", content: <p>boundaries-body</p> },
        { value: "units", title: "الوحدات", content: <input aria-label="unit-input" /> },
      ]}
    />
  );
}

describe("property sections accordion", () => {
  it("opens one section at a time and toggles closed on a second click", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const boundaries = screen.getByRole("button", { name: "الحدود والأطوال" });
    const units = screen.getByRole("button", { name: "الوحدات" });

    expect(boundaries.getAttribute("aria-expanded")).toBe("false");
    expect(units.getAttribute("aria-expanded")).toBe("false");

    await user.click(boundaries);
    expect(boundaries.getAttribute("aria-expanded")).toBe("true");

    // Opening "units" must close "boundaries".
    await user.click(units);
    expect(units.getAttribute("aria-expanded")).toBe("true");
    expect(boundaries.getAttribute("aria-expanded")).toBe("false");

    // Clicking "units" again closes it, leaving every section collapsed.
    await user.click(units);
    expect(units.getAttribute("aria-expanded")).toBe("false");
    expect(boundaries.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps closed panels mounted so unsaved input is not lost", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "الوحدات" }));
    const input = screen.getByLabelText("unit-input") as HTMLInputElement;
    await user.type(input, "A-12");

    await user.click(screen.getByRole("button", { name: "الحدود والأطوال" }));
    expect((screen.getByLabelText("unit-input") as HTMLInputElement).value).toBe("A-12");
  });
});
