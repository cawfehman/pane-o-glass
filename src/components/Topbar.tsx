import { auth } from "@/lib/auth";
import TopbarClient from "./TopbarClient";

export default async function Topbar() {
    const session = await auth();

    return (
        <TopbarClient userName={session?.user?.name || "User"} />
    );
}

