import java.lang.management.ManagementFactory;
import java.lang.management.ThreadMXBean;
import java.util.concurrent.CountDownLatch;

/** G7 JVM 题：构造真实线程死锁，并用 ThreadMXBean 找出来（不是靠 sleep 猜）。 */
public final class Deadlock {
    static final Object A = new Object();
    static final Object B = new Object();
    static final CountDownLatch LOCKED_A = new CountDownLatch(1);
    static final CountDownLatch LOCKED_B = new CountDownLatch(1);

    static Thread lockAThenB() {
        return new Thread(() -> {
            synchronized (A) {
                LOCKED_A.countDown();
                await(LOCKED_B);
                synchronized (B) { /* unreachable in deadlock */ }
            }
        }, "worker-A");
    }

    static Thread lockBThenA() {
        return new Thread(() -> {
            synchronized (B) {
                LOCKED_B.countDown();
                await(LOCKED_A);
                synchronized (A) { /* unreachable in deadlock */ }
            }
        }, "worker-B");
    }

    static void await(CountDownLatch latch) {
        try {
            latch.await();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /** 轮询 ThreadMXBean.findDeadlockedThreads，最多等 timeoutMs，返回找到的死锁环长度（0 表示没找到）。 */
    public static int detectDeadlockThreads(long timeoutMs) throws InterruptedException {
        ThreadMXBean mx = ManagementFactory.getThreadMXBean();
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            long[] ids = mx.findDeadlockedThreads();
            if (ids != null && ids.length > 0) return ids.length;
            Thread.sleep(20);
        }
        return 0;
    }

    public static void main(String[] args) throws Exception {
        long timeout = args.length > 0 ? Long.parseLong(args[0]) : 3000;
        Thread t1 = lockAThenB();
        Thread t2 = lockBThenA();
        t1.setDaemon(true);
        t2.setDaemon(true);
        t1.start();
        t2.start();
        int n = detectDeadlockThreads(timeout);
        if (n == 0) {
            System.out.println("NO-DEADLOCK");
            System.exit(1);
        }
        System.out.println("deadlocked_threads=" + n);
        System.exit(0);
    }
}
