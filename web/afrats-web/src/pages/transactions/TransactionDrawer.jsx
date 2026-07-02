// src/pages/transactions/TransactionDrawer.jsx
// Drawer-based form for creating or editing a transaction.
// Uses react-hook-form for validation. On submit, calls onSave(values).
//
// Backend contract:
//   POST/PUT /api/transactions expects:
//     { amount: decimal (always positive), type: "Income"|"Expense",
//       categoryId: Guid, transactionDate: ISO date, description?: string }
//   Sign is represented by Type, not by amount sign.

import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import dayjs from 'dayjs';
import Drawer from '../../components/Drawer';

export default function TransactionDrawer({
  open,
  onClose,
  onSave,                  // async (values) => void; throws on failure
  onDelete,                // async () => void; only shown in edit mode
  transaction = null,      // null = create mode; object = edit mode
  categories = [],
  isSaving = false,
  serverErrors = {},       // field-level errors from backend, e.g. { amount: "...", categoryId: "..." }
}) {
  const isEdit = transaction != null;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      type: 'Expense',
      amount: '',
      categoryId: '',
      description: '',
      transactionDate: dayjs().format('YYYY-MM-DD'),
    },
  });

  const watchedType = watch('type');
  const watchedCategoryId = watch('categoryId');

  // Filter categories by selected type. Backend has Category.Type enum that
  // already classifies each system category. We just respect it on the UI.
  const filteredCategories = useMemo(() => {
    if (!watchedType) return categories;
    return categories.filter((c) => c.type === watchedType);
  }, [categories, watchedType]);

  // Sync form when transaction changes (or drawer reopens)
  useEffect(() => {
    if (open) {
      reset(
        transaction
          ? {
              type: transaction.type,
              amount: Math.abs(transaction.amount),
              categoryId: transaction.categoryId ?? '',
              description: transaction.description ?? '',
              transactionDate: dayjs(transaction.transactionDate).format('YYYY-MM-DD'),
            }
          : {
              type: 'Expense',
              amount: '',
              categoryId: '',
              description: '',
              transactionDate: dayjs().format('YYYY-MM-DD'),
            }
      );
    }
  }, [open, transaction, reset]);

  // If user switches Type and currently selected categoryId no longer matches,
  // clear it so they can't accidentally submit an Income with an Expense category.
  useEffect(() => {
    if (!watchedCategoryId) return;
    const stillValid = filteredCategories.some((c) => c.id === watchedCategoryId);
    if (!stillValid) {
      setValue('categoryId', '', { shouldDirty: true });
    }
  }, [watchedType, filteredCategories, watchedCategoryId, setValue]);

  // Surface backend field-level errors into the form (e.g. validation from FluentValidation)
  useEffect(() => {
    if (!serverErrors || Object.keys(serverErrors).length === 0) return;
    for (const [field, message] of Object.entries(serverErrors)) {
      setError(field, { type: 'server', message });
    }
  }, [serverErrors, setError]);

  const submit = async (values) => {
    try {
      // Backend expects positive amount + Type enum string. No sign manipulation.
      await onSave({
        amount: Math.abs(Number(values.amount)),
        type: values.type,
        categoryId: values.categoryId,
        transactionDate: values.transactionDate,
        description: values.description?.trim() || null,
      });
      onClose();
    } catch {
      // onSave handler should surface errors via toast / serverErrors prop.
      // Drawer stays open so the user can correct and retry.
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Transaction' : 'New Transaction'}
      subtitle={isEdit ? `ID: ${transaction.id}` : 'Add a new income or expense entry'}
      width="max-w-md"
      footer={
        <div className="flex items-center justify-between">
          {isEdit && onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={isSaving}
              className="px-3 py-2 text-sm text-expense hover:bg-expense/10 rounded-md transition-colors disabled:opacity-50"
            >
              Delete
            </button>
          ) : <div />}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="transaction-form"
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-dark rounded-md transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </div>
      }
    >
      <form
        id="transaction-form"
        onSubmit={handleSubmit(submit)}
        className="space-y-4"
      >
        {/* Type — segmented buttons */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Type</label>
          <div className="grid grid-cols-2 gap-2">
            <label
              className={`flex items-center justify-center px-3 py-2 text-sm font-medium rounded-md border cursor-pointer transition-colors ${
                watchedType === 'Income'
                  ? 'bg-income/10 border-income text-[#1E8449]'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <input type="radio" value="Income" className="sr-only" {...register('type')} />
              Income
            </label>
            <label
              className={`flex items-center justify-center px-3 py-2 text-sm font-medium rounded-md border cursor-pointer transition-colors ${
                watchedType === 'Expense'
                  ? 'bg-expense/10 border-expense text-[#C0392B]'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <input type="radio" value="Expense" className="sr-only" {...register('type')} />
              Expense
            </label>
          </div>
          {errors.type && (
            <p className="text-xs text-expense mt-1">{errors.type.message}</p>
          )}
        </div>

        {/* Amount */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Amount (₺) <span className="text-expense">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            {...register('amount', {
              required: 'Amount is required',
              min: { value: 0.01, message: 'Amount must be greater than 0' },
            })}
            className={`w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 ${
              errors.amount
                ? 'border-expense focus:ring-expense focus:border-expense'
                : 'border-gray-200 focus:ring-secondary focus:border-secondary'
            }`}
          />
          {errors.amount && (
            <p className="text-xs text-expense mt-1">{errors.amount.message}</p>
          )}
        </div>

        {/* Date */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Date <span className="text-expense">*</span>
          </label>
          <input
            type="date"
            {...register('transactionDate', { required: 'Date is required' })}
            className={`w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 ${
              errors.transactionDate
                ? 'border-expense focus:ring-expense focus:border-expense'
                : 'border-gray-200 focus:ring-secondary focus:border-secondary'
            }`}
          />
          {errors.transactionDate && (
            <p className="text-xs text-expense mt-1">{errors.transactionDate.message}</p>
          )}
        </div>

        {/* Category */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Category <span className="text-expense">*</span>
          </label>
          <select
            {...register('categoryId', { required: 'Category is required' })}
            className={`w-full px-3 py-2 text-sm border rounded-md bg-white focus:outline-none focus:ring-1 ${
              errors.categoryId
                ? 'border-expense focus:ring-expense focus:border-expense'
                : 'border-gray-200 focus:ring-secondary focus:border-secondary'
            }`}
          >
            <option value="">Select a category…</option>
            {filteredCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {errors.categoryId && (
            <p className="text-xs text-expense mt-1">{errors.categoryId.message}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Description</label>
          <textarea
            {...register('description')}
            rows={3}
            placeholder="Optional notes…"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-secondary focus:border-secondary resize-none"
          />
          {errors.description && (
            <p className="text-xs text-expense mt-1">{errors.description.message}</p>
          )}
        </div>
      </form>
    </Drawer>
  );
}