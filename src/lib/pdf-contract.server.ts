import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type ContractPdfData = {
  number: string;
  branchName: string;
  serviceName?: string | null;
  planName?: string | null;
  monthlyPrice: number;
  discountLabel?: string | null;
  startDate: string;
  endDate?: string | null;
  clientName: string;
  clientPhone?: string | null;
  clientEmail?: string | null;
  clientAddress?: string | null;
  childName?: string | null;
  childBirthDate?: string | null;
};

// Minimal Latin transliteration so StandardFonts (Helvetica) can render Ukrainian.
// Keeps the placeholder legible without shipping a Unicode TTF.
function tr(str: string | null | undefined): string {
  if (!str) return "";
  const map: Record<string, string> = {
    а:"a",б:"b",в:"v",г:"h",ґ:"g",д:"d",е:"e",є:"ye",ж:"zh",з:"z",и:"y",і:"i",ї:"yi",й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"shch",ь:"",ю:"yu",я:"ya",
    "'":"'","ʼ":"'","’":"'","–":"-","—":"-","…":"...",
  };
  return str
    .split("")
    .map((c) => {
      const l = c.toLowerCase();
      const t = map[l];
      if (t === undefined) return c;
      return c === l ? t : t.charAt(0).toUpperCase() + t.slice(1);
    })
    .join("");
}

export async function buildContractPdf(d: ContractPdfData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  let y = 792;
  const line = (t: string, size = 11, f = font, color = rgb(0.1, 0.1, 0.15)) => {
    page.drawText(tr(t), { x: margin, y, size, font: f, color });
    y -= size + 6;
  };
  const gap = (n = 8) => { y -= n; };

  line(`Contract No. ${d.number}`, 18, bold);
  gap(6);
  line(`Branch: ${d.branchName}`);
  if (d.serviceName) line(`Service: ${d.serviceName}`);
  if (d.planName) line(`Plan: ${d.planName}`);
  line(`Start date: ${d.startDate}`);
  if (d.endDate) line(`End date: ${d.endDate}`);
  gap();
  line("Parent (Client)", 13, bold);
  line(d.clientName);
  if (d.clientPhone) line(`Phone: ${d.clientPhone}`);
  if (d.clientEmail) line(`Email: ${d.clientEmail}`);
  if (d.clientAddress) line(`Address: ${d.clientAddress}`);
  gap();
  if (d.childName) {
    line("Child", 13, bold);
    line(d.childName);
    if (d.childBirthDate) line(`Birth date: ${d.childBirthDate}`);
    gap();
  }
  line("Financial terms", 13, bold);
  line(`Monthly fee: ${d.monthlyPrice.toFixed(2)} UAH`);
  if (d.discountLabel) line(`Discount: ${d.discountLabel}`);
  gap(20);

  line("Placeholder template. Full legal text will be inserted here.", 10, font, rgb(0.4, 0.4, 0.5));
  gap(30);

  // Signature blocks
  page.drawLine({ start: { x: margin, y }, end: { x: 250, y }, thickness: 0.6, color: rgb(0.5, 0.5, 0.6) });
  page.drawLine({ start: { x: 320, y }, end: { x: 545, y }, thickness: 0.6, color: rgb(0.5, 0.5, 0.6) });
  y -= 14;
  page.drawText("Provider", { x: margin, y, size: 10, font, color: rgb(0.35, 0.35, 0.45) });
  page.drawText("Client", { x: 320, y, size: 10, font, color: rgb(0.35, 0.35, 0.45) });

  return await pdf.save();
}
