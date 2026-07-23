import { describe, expect, it } from "vitest";

import { parseCsvContacts } from "./csvImportUtils";

describe("parseCsvContacts", () => {
    it("parses rows with name, phone and email into contact objects", () => {
        const text = [
            "Name,Phone,Email",
            "Jane Doe,+256700123456,jane@example.com",
            "John Smith,0772123456,john@example.com"
        ].join("\n");

        expect(parseCsvContacts(text)).toEqual([
            { name: "Jane Doe", phone: "+256700123456", email: "jane@example.com" },
            { name: "John Smith", phone: "0772123456", email: "john@example.com" }
        ]);
    });

    it("ignores header rows and blank lines", () => {
        const text = [
            "first_name,last_name,phone",
            "",
            "Alice,Kim,+256701000000"
        ].join("\n");

        expect(parseCsvContacts(text)).toEqual([
            { name: "Alice", phone: "+256701000000", email: "" }
        ]);
    });
});
