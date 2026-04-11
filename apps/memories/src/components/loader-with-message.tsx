import { Skeleton } from "./ui/skeleton";
import { Spinner } from "./ui/spinner";

export function LoaderWithMessage({ message }: { message: string }) {
  return (
    <Skeleton className="flex items-center gap-2 p-2">
      <Spinner />
      <span>{message}</span>
    </Skeleton>
  );
}
