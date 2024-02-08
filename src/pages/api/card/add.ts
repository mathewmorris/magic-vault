import { type NextApiRequest, type NextApiResponse } from "next";
import { appRouter } from "../../../server/api/root";
import { createTRPCContext } from "../../../server/api/trpc";
import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";

type CardImagery = {
  small: string,
  normal: string,
  large: string,
  art_crop: string,
  border_crop: string,
  png: string,
}

const cardAddHandler = async (req: NextApiRequest, res: NextApiResponse) => {
  // Create context and caller
  const ctx = await createTRPCContext({ req, res });
  const caller = appRouter.createCaller(ctx);

  try {
    const {
      name,
      scryfall_id,
      scryfall_uri,
      image_status,
      layout,
      image_uris,
    } = req.body as { 
      name: string,
      scryfall_id: string,
      scryfall_uri: string,
      image_status: string,
      layout: string,
      image_uris: CardImagery,
    };

//    const card = await caller.card.add({ 
//      name,
//      scryfall_id,
//      scryfall_uri,
//      image_status,
//      layout,
//      image_uris,
//    });
    res.status(200);

  } catch (cause) {
    if (cause instanceof TRPCError) {
      // An error from tRPC occured
      const httpCode = getHTTPStatusCodeFromError(cause);
      return res.status(httpCode).json(cause);
    }
    // Another error occured
    console.error(cause);
    res.status(500).json({ message: "Internal server error" });
  }
};

export default cardAddHandler;
