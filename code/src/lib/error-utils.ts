export function getErrorMessage(error: unknown, fallback = 'An unexpected error occurred.'): string {
    return error instanceof Error && error.message ? error.message : fallback;
}

export function hasErrorCode(error: unknown, code: string): boolean {
    return typeof error === 'object'
        && error !== null
        && 'code' in error
        && error.code === code;
}
