import { NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { Pinecone } from "@pinecone-database/pinecone";
import * as cheerio from 'cheerio';
import OpenAI from "openai";

export async function POST(req) {
    const { link } = await req.json();

    // Launch Puppeteer and scrape the data
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(link);

    // Extract data using Cheerio
    const content = await page.content();
    const $ = cheerio.load(content);

    // Extract the professor's name
    const firstName = $('div.NameTitle__Name-dowf0z-0 span').first().text();
    const lastName = $('span.NameTitle__LastNameWrapper-dowf0z-2').text().replace('"', '').trim();
    const professorName = `${firstName} ${lastName}`;
    let department = $('div.NameTitle__Title-dowf0z-1 a.TeacherDepartment__StyledDepartmentLink-fl79e8-0.iMmVHb b').text();
    department = department.replace('department', '').trim();
    
    //const university = $('div.NameTitle__Title-dowf0z-1 a').last().text();

    const rating = $('.RatingValue__Numerator-qw8sqy-2').text().trim();

    console.log(`Professor Name: ${professorName}`);
    console.log(`Department: ${department}`);
    //console.log(`University: ${university}`);
    console.log(`Rating: ${rating}`);

    await browser.close();

    if (!professorName || !department || !rating) {
        return NextResponse.json({ success: false, message: 'Failed to extract professor name' }, { status: 400 })
    };

    // Generate embedding
    const openai = new OpenAI();
    const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small', // Ensure this model matches the dimensionality expected by your Pinecone index (likely 1536 dimensions)
        input: `${professorName} ${department} ${rating}`,
        encoding_format: 'float',
    });

    const embedding = embeddingResponse.data[0].embedding;
    console.log('Generated Embedding:', embedding);

    // Process and insert data into Pinecone
    const pc = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY,
    })
    
    const index = pc.index('rag').namespace('ns1');

    await index.upsert([
        {
            id: professorName,
            values: embedding,
            metadata: {
                name: professorName,
                subject: department,
                stars: rating,
                url: link
            }
        }
    ])

    return NextResponse.json({ success: true })
}