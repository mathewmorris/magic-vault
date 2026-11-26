import { type DeckProblem } from "~/utils/deck/checkDeck";

export default function DeckProblems({ problems }: { problems: DeckProblem[] }) {
  if (problems.length === 0) {
    return <p className="text-green-400">No problems found.</p>;
  }

  return (
    <ul className="flex list-disc flex-col gap-1 pl-6 text-amber-400">
      {problems.map((problem, index) => (
        // Problems have no id, and the list is rebuilt whole every render.
        <li key={`${problem.kind}-${index}`}>{problem.message}</li>
      ))}
    </ul>
  );
}
