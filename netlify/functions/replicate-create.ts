import type { Handler, HandlerEvent } from "@netlify/functions";

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
  if (!REPLICATE_API_TOKEN) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "REPLICATE_API_TOKEN not configured" }),
    };
  }

  try {
    const { owner, model, input } = JSON.parse(event.body || "{}");
    
    if (!owner || !model || !input) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required fields: owner, model, input" }),
      };
    }

    const response = await fetch(
      `https://api.replicate.com/v1/models/${owner}/${model}/predictions`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${REPLICATE_API_TOKEN}`,
          "Content-Type": "application/json",
          "Prefer": event.headers["prefer"] || "wait=60",
        },
        body: JSON.stringify({ input }),
      }
    );

    const data = await response.json();

    return {
      statusCode: response.status,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || "Internal server error" }),
    };
  }
};

export { handler };
