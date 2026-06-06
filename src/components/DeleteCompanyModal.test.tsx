import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as companiesApi from "../api/companies.js";
import { DeleteCompanyModal } from "./DeleteCompanyModal.js";

describe("DeleteCompanyModal", () => {
  let purgeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    purgeSpy = vi.spyOn(companiesApi, "purgeCompany");
  });
  afterEach(() => {
    purgeSpy.mockRestore();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <DeleteCompanyModal
        open={false}
        companyId="c1"
        companyName="Acme"
        onClose={() => {}}
        onPurged={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows the confirm UI when open", () => {
    render(
      <DeleteCompanyModal
        open
        companyId="c1"
        companyName="Acme"
        onClose={() => {}}
        onPurged={() => {}}
      />
    );
    expect(screen.getByText(/from the system/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Delete permanently/i })).toBeTruthy();
  });

  it("calls purgeCompany + onPurged with the summary on confirm", async () => {
    const summary = {
      id: "c1",
      name: "Acme",
      hubspotCompanyId: "hs-1",
      documents: 3,
      deals: 1
    };
    purgeSpy.mockResolvedValue(summary);
    const onPurged = vi.fn();
    render(
      <DeleteCompanyModal
        open
        companyId="c1"
        companyName="Acme"
        onClose={() => {}}
        onPurged={onPurged}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Delete permanently/i }));
    await waitFor(() => expect(onPurged).toHaveBeenCalledWith(summary));
    expect(purgeSpy).toHaveBeenCalledWith("c1");
  });
});
