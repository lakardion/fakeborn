import { createFakeSessions } from "./fakes/session.ts";

const [_, countStr] = Deno.args;
const count = parseInt(countStr);
if (isNaN(count))
  throw new Error("Please provide a number to generate fake data");

console.log(createFakeSessions(count));
