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
  const snapshot = await getBoardSnapshot(boardId);
  if (!snapshot) notFound();

  const [boards, owners] = await Promise.all([listBoards(), listOwners(boardId)]);

  return (
    <BoardView
      snapshot={snapshot}
      boards={boards.map(({ id, name }) => ({ id, name }))}
      owners={owners}
    />
  );
}
