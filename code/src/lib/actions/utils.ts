import { ObjectId, type Filter } from 'mongodb';

type LegacyIdDocument = { _id: ObjectId | string };
type ActionError = { success: false; error: string };
type ProfileError = { error: string };

const getErrorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : 'An unknown error occurred.';

export const getQueryById = (id: string): Filter<LegacyIdDocument> => {
    try {
        return {
            $or: [
                { _id: ObjectId.isValid(id) ? new ObjectId(id) : null },
                { _id: id }
            ].filter(q => q._id !== null)
        };
    } catch (e) {
        return { _id: id };
    }
};

export const mapDoc = <T extends { _id: { toString(): string } }>(doc: T | null | undefined) => {
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return { id: _id.toString(), ...rest };
};

export function handleError(actionName: string, error: unknown, defaultMsg: string = 'An unexpected error occurred. Please try again.'): ActionError {
    // Production error logging sanitization - hides stack traces, database details, etc.
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) {
        console.error(`[Error] in ${actionName}: ${getErrorMessage(error)}`);
    } else {
        console.error(`Error in ${actionName}:`, error);
    }
    return { success: false, error: defaultMsg };
}

export function handleProfileError(actionName: string, error: unknown, defaultMsg: string = 'An error occurred.'): ProfileError {
    // Production error logging sanitization
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) {
        console.error(`[Profile Error] in ${actionName}: ${getErrorMessage(error)}`);
    } else {
        console.error(`Error in ${actionName}:`, error);
    }
    return { error: defaultMsg };
}
