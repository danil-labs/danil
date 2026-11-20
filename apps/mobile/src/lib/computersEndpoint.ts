import { COMPUTERS_ENDPOINT } from "@terminus/computers";

export const COMPUTERS = process.env.EXPO_PUBLIC_COMPUTERS_ENDPOINT || COMPUTERS_ENDPOINT;
