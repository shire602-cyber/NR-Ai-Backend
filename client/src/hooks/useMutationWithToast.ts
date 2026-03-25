import { useMutation, type UseMutationOptions, type UseMutationResult } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface MutationWithToastOptions<TData, TError, TVariables, TContext>
  extends UseMutationOptions<TData, TError, TVariables, TContext> {
  successMessage?: string;
  errorMessage?: string;
}

export function useMutationWithToast<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TContext = unknown,
>(
  options: MutationWithToastOptions<TData, TError, TVariables, TContext>
): UseMutationResult<TData, TError, TVariables, TContext> {
  const { toast } = useToast();
  const { successMessage, errorMessage, onSuccess, onError, ...rest } = options;

  return useMutation<TData, TError, TVariables, TContext>({
    ...rest,
    onSuccess: (data, variables, context) => {
      if (successMessage) {
        toast({
          title: successMessage,
        });
      }
      onSuccess?.(data, variables, context);
    },
    onError: (error, variables, context) => {
      toast({
        title: errorMessage || "An error occurred",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
      onError?.(error, variables, context);
    },
  });
}
