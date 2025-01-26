import OpenAI from "openai";
import process from "process";
import { join } from "path";
import { tmpdir } from "os";
import { readFile } from "fs/promises";
import ffmpeg from "fluent-ffmpeg";

const BOWL = join(tmpdir(), "catd-bowl.webp");

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

console.log(`ffmpeg catcam into ${BOWL}`)

await new Promise<void>((resolve, reject) => {
    ffmpeg("https://catcam.tailnet.ckie.dev/index.m3u8")
        .on("error", (e, _, stderr) => {
            console.error(stderr);
            reject(e);
        })
        .on("end", () => resolve())
        .frames(1)
        .save(BOWL);
});

console.log(`read ${BOWL} into base64`)
const encoded = await readFile(BOWL, { encoding: "base64" });

let n;
for (let i = 0; i <= 2; i++) {
    const langlemangle = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: "Please output a percentage, 0-100% of how full of kibble the cat bowl is. Do not say anything else.",
                    },
                    {
                        type: "image_url",
                        image_url: {
                            url: `data:image/webp;base64,${encoded}`,
                            detail: "high",
                        },
                    },
                ],
            },
        ],
        max_completion_tokens: 10,
    });
    console.log(`llm result:`, langlemangle.choices[0].message.content)

    const perc =
        langlemangle.choices[0].message.content?.match(
            /\b(\d+(?:\.\d+)?)%/
        )?.[1];
    if (!perc) continue;

    n = parseFloat(perc) / 100;
    console.log({n})
    break;
}

if (n! <= 0.5) {
    console.log("ntfy send");
    const resp = await fetch(process.env.NTFY_URL!, {
        method: "POST",
        headers: {
            Title: `pspspsps: ${n! * 10}/10`,
            Priority: "high",
        },
        body: await Bun.file(BOWL).arrayBuffer(),
    });

    if (!resp.ok) throw new Error(`${resp.status}: ${await resp.text()}`);
}
