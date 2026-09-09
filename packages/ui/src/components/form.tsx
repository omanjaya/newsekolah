import * as LabelPrimitive from "@radix-ui/react-label";
import { Slot } from "@radix-ui/react-slot";
import {
  createContext,
  useContext,
  useId,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
  type UseFormReturn,
} from "react-hook-form";

import { cn } from "../utils/cn.js";

/**
 * Translates a validation message. `@newsekolah/schemas` issues carry i18n
 * keys (e.g. "validation.required"), not literal text, so `FormMessage`
 * needs a translator to render them; pass one to `Form`. Defaults to the
 * identity function so the package has no hard dependency on
 * @newsekolah/i18n.
 */
type MessageTranslator = (key: string) => string;
const TranslatorContext = createContext<MessageTranslator>((key) => key);

export interface FormProps<T extends FieldValues> {
  form: UseFormReturn<T>;
  translate?: MessageTranslator;
  onSubmit?: (values: T) => void | Promise<void>;
  children: ReactNode;
  className?: string;
}

/** Wires react-hook-form's context plus, optionally, an i18n translator for `FormMessage`. */
export function Form<T extends FieldValues>({
  form,
  translate,
  onSubmit,
  children,
  className,
}: FormProps<T>) {
  return (
    <TranslatorContext.Provider value={translate ?? ((key) => key)}>
      <FormProvider {...form}>
        <form
          className={className}
          onSubmit={
            onSubmit
              ? (event) => {
                  void form.handleSubmit(onSubmit)(event);
                }
              : undefined
          }
          noValidate
        >
          {children}
        </form>
      </FormProvider>
    </TranslatorContext.Provider>
  );
}

interface FormFieldContextValue {
  name: string;
}
const FormFieldContext = createContext<FormFieldContextValue | null>(null);

interface FormItemContextValue {
  id: string;
}
const FormItemContext = createContext<FormItemContextValue | null>(null);

/** Binds one form field's name to the RHF `Controller`. */
export function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: ControllerProps<TFieldValues, TName>) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

function useFormField() {
  const fieldContext = useContext(FormFieldContext);
  const itemContext = useContext(FormItemContext);
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: fieldContext?.name });
  if (!fieldContext || !itemContext) {
    throw new Error("Form field components must be used inside <FormField> and <FormItem>.");
  }
  const fieldState = getFieldState(fieldContext.name, formState);
  const id = itemContext.id;
  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
}

export function FormItem({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  const id = useId();
  return (
    <FormItemContext.Provider value={{ id }}>
      <div className={cn("flex flex-col gap-1.5", className)} {...props} />
    </FormItemContext.Provider>
  );
}

export function FormLabel({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof LabelPrimitive.Root>) {
  const { error, formItemId } = useFormField();
  return (
    <LabelPrimitive.Root
      className={cn("text-[13px] font-medium text-fg", error && "text-status-absent", className)}
      htmlFor={formItemId}
      {...props}
    />
  );
}

export function FormControl({ ...props }: ComponentPropsWithoutRef<typeof Slot>) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();
  return (
    <Slot
      id={formItemId}
      aria-describedby={error ? `${formDescriptionId} ${formMessageId}` : formDescriptionId}
      aria-invalid={!!error || undefined}
      {...props}
    />
  );
}

export function FormDescription({ className, ...props }: ComponentPropsWithoutRef<"p">) {
  const { formDescriptionId } = useFormField();
  return (
    <p id={formDescriptionId} className={cn("text-[13px] text-fg-muted", className)} {...props} />
  );
}

export function FormMessage({ className, children, ...props }: ComponentPropsWithoutRef<"p">) {
  const { error, formMessageId } = useFormField();
  const translate = useContext(TranslatorContext);
  const rawMessage = error?.message;
  const body = rawMessage ? translate(rawMessage) : children;
  if (!body) return null;
  return (
    <p
      id={formMessageId}
      role="alert"
      className={cn("text-[13px] font-medium text-status-absent", className)}
      {...props}
    >
      {body}
    </p>
  );
}
