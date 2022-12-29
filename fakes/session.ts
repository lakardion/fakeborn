import { faker } from "npm:@faker-js/faker@^7.6.0";

export const createFakeSessions = (count: number) =>
  Array.from({ length: count }).map((_) => {
    return {
      id: faker.datatype.uuid(),
      title: faker.lorem.sentence(),
      video_url: faker.internet.url(),
      seen: faker.datatype.boolean(),
    };
  });
