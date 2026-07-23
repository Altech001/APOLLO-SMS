export interface ParsedContact {
    name: string;
    phone: string;
    email: string;
}

const parseCsvLine = (line: string) => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];

        if (char === '"') {
            const next = line[index + 1];
            if (inQuotes && next === '"') {
                current += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === "," && !inQuotes) {
            values.push(current.trim());
            current = "";
            continue;
        }

        current += char;
    }

    values.push(current.trim());
    return values;
};

export const parseCsvContacts = (text: string): ParsedContact[] => {
    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length === 0) return [];

    const contacts: ParsedContact[] = [];

    lines.forEach((line, index) => {
        const values = parseCsvLine(line);

        if (index === 0) {
            const joined = values.join(" ").toLowerCase();
            const isHeader =
                joined.includes("name") ||
                joined.includes("phone") ||
                joined.includes("email") ||
                joined.includes("number") ||
                joined.includes("contact");

            if (isHeader && values.length >= 2) {
                return;
            }
        }

        if (values.length === 0) return;

        const phoneCandidates = values.filter((value) => /\d/.test(value));
        const candidatePhone = (phoneCandidates[0] || values[0] || "").trim();
        const candidateName = (values[0] && !/\d/.test(values[0]) ? values[0] : "Imported Contact").trim();
        const candidateEmail = values.length > 2 && values[2].includes("@") ? values[2] : "";

        if (!candidatePhone || !/\d/.test(candidatePhone)) return;

        contacts.push({
            name: candidateName || `Imported Contact ${contacts.length + 1}`,
            phone: candidatePhone,
            email: candidateEmail,
        });
    });

    return contacts;
};
