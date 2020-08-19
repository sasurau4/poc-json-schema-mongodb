import { MongoClient } from "mongodb";
// const schema = require("./test.json");
import { createEntityClient, connect } from "@phenyl/mongodb";
import { Config as TSJConfig, createGenerator } from "ts-json-schema-generator";
import fs from "fs";

const config: TSJConfig = {
  path: "index.ts",
  tsconfig: "tsconfig.json",
  expose: "none",
  topRef: false,
  additionalProperties: false,
  type: "Movie", // Or <type-name> if you want to generate schema for that one type only
};

const output_path = "test.json";

let schema = createGenerator(config).createSchema(config.type);
const { $schema, definitions, ...validSchema } = schema;
const { properties, required } = validSchema;
if (required === undefined) {
  throw new Error("required undefined");
}
const filteredRequired = [...required.filter((r) => r !== "id"), "_id"];
// @ts-ignore
const { id, ...restProp } = properties;
schema = {
  ...validSchema,
  properties: { ...restProp, _id: { type: "string" } },
  required: filteredRequired,
};
const schemaString = JSON.stringify(schema, null, 2);
fs.writeFile(output_path, schemaString, (err) => {
  console.log(err);
});

// Replace the uri string with your MongoDB deployment's connection string.
const uri = "mongodb://localhost:27017/";

const client = new MongoClient(uri, { useUnifiedTopology: true });
const dbName = "sample_mflix";

type PhenylVersion = { id: string; op: string };
export type Movie = {
  id: string;
  title: string;
  characters?: string[];
  _PhenylMeta?: {
    versions?: PhenylVersion[];
    locked?: {
      timestamp: string;
      clientHeadVersionId: string;
      ops: string[];
    };
  };
};

// const schema = {
//   additionalProperties: true,
//   properties: {
//     characters: {
//       items: {
//         type: "string",
//       },
//       type: "array",
//     },
//     // id: {
//     //   type: "string",
//     // },
//     _id: {
//       type: "string",
//     },
//     title: {
//       type: "string",
//     },
//   },
//   required: ["title"],
//   type: "object",
// };

export type EntityMap = {
  movies: Movie;
};
async function run() {
  const conn = await connect(uri, dbName);
  try {
    const phenylClient = createEntityClient<EntityMap>(conn);

    await client.connect();

    const database = client.db(dbName);
    let collection = database.collection("movies");
    console.log("piyo");
    await collection.drop();
    collection = await database.createCollection("movies");
    await database.command({
      collMod: "movies",
      validator: {
        $jsonSchema: schema,
      },
    });
    console.info(
      "validator info: ",
      JSON.stringify(await collection.options(), null, 2)
    );

    // await collection.insertOne({
    //   title: "Back to the Future",
    //   characters: ["Skywalker"],
    // });
    // await collection.insertOne({
    //   title: "Greates Showman",
    // });

    const titanic = await phenylClient.insertAndGet({
      entityName: "movies",
      value: { id: "002", title: "TITANIC" },
    });
    console.log("succeed to insertAndGet");
    await phenylClient.push({
      entityName: "movies",
      id: titanic.entity.id,
      operations: [
        { $set: { title: "TITANIC2" } },
        { $set: { characters: ["James Cameron"] } },
        // これをコメントアウトするとvalidation error
        // { $set: { title: 1 } },
      ],
      versionId: titanic.versionId,
    });

    // Query for a movie that has the title 'Back to the Future'
    const query = { title: "Back to the Future" };
    const movie = await collection.findOne(query);

    console.log(movie);
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
    await conn.close();
  }
}
run().catch(console.dir);
