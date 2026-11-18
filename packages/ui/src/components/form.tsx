"use client";

import * as LabelPrimitive from "@radix-ui/react-label";
import { Slot } from "@radix-ui/react-slot";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
  type PathValue,
  type UseFormReturn,
} from "react-hook-form";

import { cn } from "../utils/cn.js";

import { FormFieldStateContext } from "./field-context.js";
import { FieldError } from "./field.js";

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
  /**
   * The browser's own submit method, used only when the app's handler is
   * not attached yet (a press before hydration). Defaults to `post`, so
   * that a native submit never serialises the fields (a password, a
   * one-time code) into the address bar, history, server logs or the
   * Referer header. Pair it with a submit button that stays disabled until
   * hydration (`useHydrated`) wherever the form is in the server markup.
   */
  method?: "post" | "dialog";
}

/** Field types whose value is free text, kept when typed before hydration. */
const TEXT_INPUT_TYPES = new Set(["text", "password", "email", "search", "tel", "url"]);

/**
 * Text typed (or autofilled) into a server-rendered form before React
 * hydrates lives only in the DOM: hydration keeps it, but the first
 * re-render of a controlled field writes the form state's empty value
 * back over it. Hands any such text to the form state, once, on mount.
 * On a client-only mount every field already shows its state, so this
 * finds nothing to do. It runs after the fields' own effects (a parent's
 * effects follow its children's), so their subscriptions see the update.
 */
function useAdoptTypedValues<T extends FieldValues>(
  formElement: RefObject<HTMLFormElement | null>,
  form: UseFormReturn<T>,
) {
  useEffect(() => {
    const element = formElement.current;
    if (!element) return;
    const fields = element.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input[name], textarea[name]",
    );
    for (const field of fields) {
      if (field instanceof HTMLInputElement && !TEXT_INPUT_TYPES.has(field.type)) continue;
      const name = field.name as FieldPath<T>;
      const current: unknown = form.getValues(name);
      if (typeof current !== "string" || field.value === "" || field.value === current) continue;
      form.setValue(name, field.value as PathValue<T, FieldPath<T>>, { shouldDirty: true });
    }
    // On mount (the form instance is stable): later typing reaches the
    // state through each field's onChange.
  }, [formElement, form]);
}

/** Wires react-hook-form's context plus, optionally, an i18n translator for `FormMessage`. */
export function Form<T extends FieldValues>({
  form,
  translate,
  onSubmit,
  children,
  className,
  method = "post",
}: FormProps<T>) {
  const formElement = useRef<HTMLFormElement>(null);
  useAdoptTypedValues(formElement, form);
  return (
    <TranslatorContext.Provider value={translate ?? ((key) => key)}>
      <FormProvider {...form}>
        <form
          ref={formElement}
          method={method}
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

/**
 * Binds one form field's name to the RHF `Controller`. It also publishes
 * the field's translated error, so a `Field` in `render` shows it without
 * being told: `render={({ field }) => <Field label="Nama"><Input {...field} /></Field>}`.
 * The older `FormItem`/`FormLabel`/`FormControl`/`FormMessage` set keeps
 * working as before.
 */
export function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ render, ...props }: ControllerProps<TFieldValues, TName>) {
  const translate = useContext(TranslatorContext);
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller
        {...props}
        render={(renderProps) => {
          const message = renderProps.fieldState.error?.message;
          return (
            <FormFieldStateContext.Provider
              value={{ error: message ? translate(message) : undefined }}
            >
              {render(renderProps)}
            </FormFieldStateContext.Provider>
          );
        }}
      />
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
      <div className={cn("flex flex-col gap-2", className)} {...props} />
    </FormItemContext.Provider>
  );
}

export function FormLabel({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof LabelPrimitive.Root>) {
  const { formItemId } = useFormField();
  // The label stays neutral on an error, as `Field`'s does: the danger
  // border and the message under the control already carry it.
  return (
    <LabelPrimitive.Root
      className={cn("text-label text-fg", className)}
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
    <p id={formDescriptionId} className={cn("text-body-sm text-fg-muted", className)} {...props} />
  );
}

export function FormMessage({ className, children, ...props }: ComponentPropsWithoutRef<"div">) {
  const { error, formMessageId } = useFormField();
  const translate = useContext(TranslatorContext);
  const rawMessage = error?.message;
  const body = rawMessage ? translate(rawMessage) : children;
  if (!body) return null;
  // `FormItem`'s 8px gap less 4: messages hug their control, as in `Field`.
  return (
    <div id={formMessageId} role="alert" className={cn("-mt-1", className)} {...props}>
      <FieldError>{body}</FieldError>
    </div>
  );
}
