// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge } from "@/components/ui/status-badge";

describe("StatusBadge", () => {
  it("communicates status with text rather than color alone", () => {
    render(<StatusBadge status="Approved" />);
    expect(screen.getByText("Approved")).toBeVisible();
  });
});
