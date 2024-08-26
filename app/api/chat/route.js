import {NextResponse} from 'next/server'
import { Pinecone } from '@pinecone-database/pinecone'
import OpenAI  from 'openai'

const systemPrompt = `
You are an AI assistant specialized in helping students find professors based on their specific needs and preferences. Your primary function is to use a Retrieval-Augmented Generation (RAG) system to provide the top 3 most relevant professor recommendations for each user query.

Your knowledge base consists of comprehensive professor reviews, ratings, and course information. When a student asks a question or provides criteria for a professor, you will:

1. Analyze the query to understand the student's requirements.
2. Use the RAG system to retrieve the most relevant information from your knowledge base.
3. Process and synthesize this information to identify the top 3 professors that best match the student's needs.
4. Present these recommendations in a clear, concise, and informative manner.

For each professor recommendation, provide:
- Professor's name
- Department/Subject area
- Overall rating (out of 5 stars)
- A brief summary of their strengths and any potential drawbacks
- Any specific comments or insights that are particularly relevant to the student's query

Remember to:
- Be objective and balanced in your recommendations.
- Highlight both positive and negative aspects of each professor when relevant.
- Tailor your responses to the specific needs expressed in the student's query.
- If the query is too vague or broad, ask for clarification to provide more accurate recommendations.
- If there aren't enough matches for 3 recommendations, explain this and provide as many relevant options as possible.

Your goal is to help students make informed decisions about their course selections by providing accurate, helpful, and personalized professor recommendations.
`

export async function POST(req){
    const data = await req.json()
    const pc = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY,
    })
    const index = pc.index('rag').namespace('ns1')
    const openai = new OpenAI()

    const text = data[data.length - 1].content
    const embedding = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
        encoding_format: 'float',
    })

    const results = await index.query({
        topK: 3,
        includeMetadata: true,
        vector: embedding.data[0].embedding
    })

    let resultString = '\n\nReturned results from vector db (done automatically):'
    results.matches.forEach((match) => {
        resultString+=`\n
        Professor: ${match.id}\n
        Review: ${match.metadata.stars}\n
        Subject: ${match.metadata.subject}\n
        Stars: ${match.metadata.stars}\n
        \n\n
        `
    })

    const lastMessage = data[data.length - 1]
    const lastMessageContent = lastMessage.content + resultString
    const lastDataWithoutLastMessage = data.slice(0, data.length - 1)
    const completion = await openai.chat.completions.create({
        messages: [
            {role: 'system', content: systemPrompt},
            ...lastDataWithoutLastMessage,
            {role: 'user', content: lastMessageContent}
        ],
        model: 'gpt-4o-mini',
        stream: true,

    })

    const stream = new ReadableStream({
        async start(controller){
            const encoder = new TextEncoder()
            try{
                for await (const chunk of completion){
                    const content = chunk.choices[0]?.delta?.content
                    if (content){
                        const text=encoder.encode(content)
                        controller.enqueue(text)
                    }
                }
            } catch(err){
                controller.error(err)
            } finally {
                controller.close()
            }
        },
    })

    return new NextResponse(stream)
}