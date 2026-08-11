import { notFound } from "next/navigation";

import BoardView from "@/components/BoardView";
import { getBoardSnapshot, listBoards, listOwners } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = await params;
  const snapshot = getBoardSnapshot(boardId);
  if (!snapshot) notFound();

  return (
    <BoardView
      snapshot={snapshot}
      boards={listBoards().map(({ id, name }) => ({ id, name }))}
      owners={listOwners(boardId)}
    />
  );
}
