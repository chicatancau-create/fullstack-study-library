import java.util.ArrayList;
import java.util.List;
public class Leak {
  static final List<byte[]> KEEP = new ArrayList<>();
  public static void main(String[] args) {
    int i = 0;
    while (true) {
      KEEP.add(new byte[512 * 1024]);
      if ((++i % 20) == 0) System.out.println("allocated_mb=" + i / 2);
    }
  }
}
